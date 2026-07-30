import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { betterAuth } from "better-auth";
import { signJWT } from "better-auth/crypto";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";

const DEFAULT_SECRET = "better-auth-secret-123456789";

const mswServer = setupServer(
	http.post("https://oauth2.googleapis.com/token", async () => {
		const data: GoogleProfile = {
			email: "google-user@example.com",
			email_verified: true,
			name: "Google Test User",
			picture: "https://lh3.googleusercontent.com/a-/test",
			exp: 1234567890,
			sub: "google-1234567890",
			iat: 1234567890,
			aud: "test",
			azp: "test",
			nbf: 1234567890,
			iss: "test",
			locale: "en",
			jti: "test",
			given_name: "Google Test",
			family_name: "User",
		};
		const testIdToken = await signJWT(data, DEFAULT_SECRET);
		return HttpResponse.json({
			access_token: "test-access-token",
			refresh_token: "test-refresh-token",
			id_token: testIdToken,
			token_type: "Bearer",
			expires_in: 3600,
		});
	}),
);

/**
 * Reproduces the exact scenario from the user report in issue #7994.
 *
 * The user reported that in stateless mode (no database, OAuth login),
 * calling refreshSession after the refreshCache window extends session_data
 * and account_data cookies but NOT the session_token cookie — causing
 * forced logout at exactly expiresIn.
 *
 * @see https://github.com/better-auth/better-auth/issues/7994
 */
describe("session_token cookie refresh in stateless mode", () => {
	it("should extend session_token cookie expiry when refreshCache triggers", async (t) => {
		t.before(() => {
			mswServer.listen({ onUnhandledRequest: "bypass" });
		});

		t.after(() => {
			mswServer.close();
		});

		t.afterEach(() => {
			mswServer.resetHandlers();
		});

		const expiresIn = 60 * 5; // 5 minutes
		const cookieCacheMaxAge = 60 * 5; // 5 minutes

		const auth = betterAuth({
			database: undefined,
			baseURL: "http://localhost:3000",
			secret: DEFAULT_SECRET,
			session: {
				expiresIn,
				updateAge: 60 * 2, // 2 minutes (matches user report)
				cookieCache: {
					enabled: true,
					maxAge: cookieCacheMaxAge,
					strategy: "jwe",
					refreshCache: true, // boolean form as in user report
				},
			},
			account: {
				storeStateStrategy: "cookie",
				storeAccountCookie: true,
			},
			socialProviders: {
				google: {
					clientId: "demo",
					clientSecret: "demo-secret",
				},
			},
		});

		// Step 1: Initiate Google OAuth sign-in
		const signInRes = await auth.api.signInSocial({
			body: {
				provider: "google",
				callbackURL: "/callback",
			},
			asResponse: true,
		});
		assert.equal(signInRes.status, 200);

		const signInData: any = await signInRes.json();
		assert.ok(signInData.url);

		const state = new URL(signInData.url).searchParams.get("state");
		assert.ok(state);

		// Carry OAuth state cookies to the callback
		const headers = new Headers();
		const signInSetCookie = signInRes.headers.get("set-cookie");
		if (signInSetCookie) {
			headers.set("cookie", signInSetCookie);
		}

		// Step 2: Complete OAuth callback — this creates the session
		const callbackRes = await auth.handler(
			new Request(
				`http://localhost:3000/api/auth/callback/google?state=${state}&code=test-code`,
				{ method: "GET", headers },
			),
		);
		assert.equal(callbackRes.status, 302);

		// Extract all session cookies from the callback redirect
		const cookies = new Map<string, string>();
		for (const h of callbackRes.headers.getSetCookie()) {
			mergeCookies(cookies, h);
		}
		assert.ok(
			cookies.has("better-auth.session_token"),
			"callback should set session_token cookie",
		);
		assert.ok(
			cookies.has("better-auth.session_data"),
			"callback should populate the session cookie cache",
		);

		// Step 3: Advance time past the refreshCache window
		// refreshCache: true with maxAge 300 → updateAge = maxAge * 0.2 = 60
		// Refresh window starts at 300 - 60 = 240s
		const originalDateNow = Date.now;
		const refreshTime = originalDateNow.call(Date) + 241 * 1000;
		Date.now = () => refreshTime;

		// Step 4: Explicitly refresh the session
		const refreshRes = await auth.handler(
			new Request("http://localhost:3000/api/auth/refresh-session", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					cookie: buildCookieHeader(cookies),
					origin: "http://localhost:3000",
				},
				body: "{}",
			}),
		);

		Date.now = originalDateNow;

		assert.equal(refreshRes.status, 200);

		// Step 5: Verify session_token cookie has extended max-age
		const refreshedCookies = refreshRes.headers
			.getSetCookie()
			.flatMap(parseSetCookieEntries);
		const sessionTokenEntry = refreshedCookies.find(
			(c) => c.name === "better-auth.session_token",
		);

		assert.ok(
			sessionTokenEntry,
			"session_token cookie should be present in refresh response",
		);
		assert.equal(
			sessionTokenEntry.maxAge,
			expiresIn,
			`session_token max-age should be extended to expiresIn (${expiresIn}), got ${sessionTokenEntry.maxAge}`,
		);
	});
});

// --- helpers ---

interface ParsedCookie {
	name: string;
	value: string;
	maxAge?: number;
}

function parseSetCookieEntries(header: string): ParsedCookie[] {
	const segments = header.split(";").map((s) => s.trim());
	const [nameValue, ...attrs] = segments;
	const eqIdx = nameValue!.indexOf("=");
	const name = nameValue!.slice(0, eqIdx);
	const value = nameValue!.slice(eqIdx + 1);
	const cookie: ParsedCookie = { name, value };
	for (const attr of attrs) {
		const [key, val] = attr.split("=");
		if (key!.toLowerCase().trim() === "max-age") {
			cookie.maxAge = Number(val);
		}
	}
	return [cookie];
}

function buildCookieHeader(cookies: Map<string, string>): string {
	return Array.from(cookies.entries())
		.map(([name, value]) => `${name}=${value}`)
		.join("; ");
}

function mergeCookies(
	cookies: Map<string, string>,
	setCookieHeader: string,
): void {
	for (const cookie of parseSetCookieEntries(setCookieHeader)) {
		cookies.set(cookie.name, cookie.value);
	}
}
