import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { oauthProvider } from "./oauth";

/**
 * `WWW-Authenticate` is not a CORS-safelisted response header, so a
 * cross-origin client, such as a browser MCP client that registers itself, can
 * read a challenge only when the response exposes it.
 * @see https://fetch.spec.whatwg.org/#cors-safelisted-response-header-name
 */
describe("challenges expose WWW-Authenticate", async () => {
	const baseURL = "http://localhost:3000";
	const { customFetchImpl } = await getTestInstance({
		baseURL,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (ctx.path === "/oauth2/register") {
					ctx.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
				}
			}),
		},
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				allowDynamicClientRegistration: true,
				validateInitialAccessToken: () => false,
			}),
		],
	});

	const send = (path: string, init: RequestInit) =>
		customFetchImpl(`${baseURL}/api/auth${path}`, init);
	const register = (authorization?: string) =>
		send("/oauth2/register", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				...(authorization ? { authorization } : {}),
			},
			body: JSON.stringify({
				redirect_uris: ["https://app.example.com/callback"],
			}),
		});
	const token = (authorization: string) =>
		send("/oauth2/token", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				authorization,
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
			}).toString(),
		});

	it.each([
		["registration without credentials", () => register(), "Bearer"],
		[
			"registration with a rejected initial access token",
			() => register("Bearer not-a-valid-token"),
			'Bearer error="invalid_token"',
		],
	])(
		"exposes the %s challenge and keeps exposed names",
		async (_, request, challenge) => {
			const response = await request();
			expect(response.status).toBe(401);
			expect(response.headers.get("WWW-Authenticate")).toBe(challenge);
			expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
				"X-Request-Id, WWW-Authenticate",
			);
		},
	);

	it.each([
		["a malformed Basic header", () => token("Basic %%%")],
		[
			"an unknown Basic client",
			() => token(`Basic ${btoa("unknown-client:secret")}`),
		],
		[
			"a rejected UserInfo token",
			() =>
				send("/oauth2/userinfo", {
					method: "GET",
					headers: { authorization: "Bearer not-a-valid-token" },
				}),
		],
	])("exposes the challenge for %s", async (_, request) => {
		const response = await request();
		expect(response.status).toBe(401);
		expect(response.headers.get("WWW-Authenticate")).toBeTruthy();
		expect(response.headers.get("Access-Control-Expose-Headers")).toBe(
			"WWW-Authenticate",
		);
	});
});
