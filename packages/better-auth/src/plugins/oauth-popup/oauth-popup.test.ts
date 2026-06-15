import { createHash } from "node:crypto";
import { betterFetch } from "@better-fetch/fetch";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthClient } from "../../client";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { bearer } from "../bearer";
import { genericOAuth } from "../generic-oauth";
import { genericOAuthClient } from "../generic-oauth/client";
import {
	OAUTH_POPUP_COMPLETE_SCRIPT,
	OAUTH_POPUP_DATA_ELEMENT_ID,
	OAUTH_POPUP_SCRIPT_CSP_HASH,
	oauthPopup,
} from "./index";

describe("oauth popup completion script", () => {
	// The completion page runs this script inline and pins its hash in the CSP.
	// If the script body changes, recompute and update OAUTH_POPUP_SCRIPT_CSP_HASH.
	it("pins the script's sha256 in the response CSP hash", () => {
		const digest = createHash("sha256")
			.update(OAUTH_POPUP_COMPLETE_SCRIPT)
			.digest("base64");
		expect(OAUTH_POPUP_SCRIPT_CSP_HASH).toBe(`sha256-${digest}`);
	});
});

describe("oauth popup server flow", async () => {
	const providerId = "test";
	const popupOrigin = "http://localhost:3000";
	const server = new OAuth2Server();
	await server.start();
	const port = Number(server.issuer.url?.split(":")[2]!);

	afterAll(async () => {
		await server.stop();
	});

	const { customFetchImpl, auth, cookieSetter } = await getTestInstance({
		baseURL: popupOrigin,
		// Cookie-cached sessions make the callback set both session_token and
		// session_data, so the completion response carries multiple Set-Cookie
		// headers (the case where the token cookie was getting dropped).
		session: { cookieCache: { enabled: true } },
		databaseHooks: {
			user: {
				create: {
					before: async (user) => ({ data: { ...user, emailVerified: true } }),
				},
			},
		},
		plugins: [
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
			oauthPopup(),
			bearer(),
		],
	});

	const authClient = createAuthClient({
		plugins: [genericOAuthClient()],
		baseURL: popupOrigin,
		fetchOptions: { customFetchImpl },
	});

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
	});

	server.service.on("beforeUserinfo", (userInfoResponse) => {
		userInfoResponse.body = {
			email: "popup@test.com",
			name: "Popup User",
			sub: "popup",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	const startUrl =
		`${popupOrigin}/api/auth/oauth-popup/start` +
		`?provider=${providerId}` +
		`&popupOrigin=${encodeURIComponent(popupOrigin)}` +
		`&popupNonce=n1` +
		`&callbackURL=${encodeURIComponent(`${popupOrigin}/dashboard`)}`;

	// Drives the start endpoint, follows the provider redirect, then hits the
	// callback with the cookies the start endpoint set.
	async function runPopupFlow() {
		const cookies = new Headers();
		const startRes = await customFetchImpl(startUrl, {
			method: "GET",
			redirect: "manual",
		});
		cookieSetter(cookies)({ response: startRes } as never);

		let providerCallback = "";
		await betterFetch(startRes.headers.get("location") || "", {
			method: "GET",
			redirect: "manual",
			onError(context) {
				providerCallback = context.response.headers.get("location") || "";
			},
		});

		const callbackRes = await customFetchImpl(providerCallback, {
			method: "GET",
			headers: cookies,
			redirect: "manual",
		});
		return { startRes, callbackRes, cookies };
	}

	it("redirects to the provider and sets the opener marker cookie", async () => {
		const { startRes } = await runPopupFlow();
		expect(startRes.headers.get("set-cookie")).toContain(
			"better-auth.oauth_popup",
		);
	});

	it("returns the completion page instead of redirecting", async () => {
		const { callbackRes } = await runPopupFlow();
		expect(callbackRes.status).toBe(200);
		expect(callbackRes.headers.get("content-type")).toContain("text/html");
		// The page carries the session token, so it must not be cached.
		expect(callbackRes.headers.get("cache-control")).toContain("no-store");

		const body = await callbackRes.text();
		expect(body).toContain(OAUTH_POPUP_DATA_ELEMENT_ID);
		expect(body).toContain("postMessage");
		// Every callback cookie must survive onto the completion response. The
		// session token cookie is the one that was getting dropped when the
		// callback also set the cookie-cached session_data.
		const completionCookies = callbackRes.headers.get("set-cookie") ?? "";
		expect(completionCookies).toContain("better-auth.session_token");
		expect(completionCookies).toContain("better-auth.session_data");
	});

	it("hands off a token that authenticates via the bearer plugin", async () => {
		const { callbackRes } = await runPopupFlow();
		const token = parseSetCookieHeader(
			callbackRes.headers.get("set-cookie") || "",
		).get("better-auth.session_token")?.value;
		expect(token).toBeTruthy();

		const session = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${token}` }),
		});
		expect(session?.user.email).toBe("popup@test.com");
	});

	it("keeps the redirect when it is not a popup flow", async () => {
		const signInHeaders = new Headers();
		const signInRes = await authClient.signIn.oauth2({
			providerId,
			callbackURL: `${popupOrigin}/dashboard`,
			fetchOptions: { onSuccess: cookieSetter(signInHeaders) },
		});

		let location = "";
		await betterFetch(signInRes.data?.url || "", {
			method: "GET",
			redirect: "manual",
			onError(context) {
				location = context.response.headers.get("location") || "";
			},
		});
		const callbackRes = await customFetchImpl(location, {
			method: "GET",
			headers: signInHeaders,
			redirect: "manual",
		});

		expect(callbackRes.status).toBe(302);
		expect(callbackRes.headers.get("location")).toBe(
			`${popupOrigin}/dashboard`,
		);
	});

	it("relays an OAuth error to the opener instead of redirecting", async () => {
		const cookies = new Headers();
		const startRes = await customFetchImpl(startUrl, {
			method: "GET",
			redirect: "manual",
		});
		cookieSetter(cookies)({ response: startRes } as never);
		const state = new URL(
			startRes.headers.get("location") || "",
		).searchParams.get("state");

		const callbackRes = await customFetchImpl(
			`${popupOrigin}/api/auth/oauth2/callback/${providerId}?state=${state}&error=access_denied`,
			{ method: "GET", headers: cookies, redirect: "manual" },
		);

		expect(callbackRes.status).toBe(200);
		const body = await callbackRes.text();
		expect(body).toContain(OAUTH_POPUP_DATA_ELEMENT_ID);
		expect(body).toContain("access_denied");
	});

	it("relays a start-stage error (unknown provider) to the opener", async () => {
		const res = await customFetchImpl(
			`${popupOrigin}/api/auth/oauth-popup/start?provider=nope&popupOrigin=${encodeURIComponent(popupOrigin)}&popupNonce=n1`,
			{ method: "GET", redirect: "manual" },
		);
		expect(res.status).toBe(200);
		const body = await res.text();
		expect(body).toContain(OAUTH_POPUP_DATA_ELEMENT_ID);
		expect(body).toContain("provider_not_found");
	});

	it("keeps internal state keys out of additionalData when storing state", async () => {
		const additionalData = encodeURIComponent(
			JSON.stringify({
				link: { email: "popup@test.com", userId: "some-user-id" },
				tenant: "acme",
			}),
		);
		const startRes = await customFetchImpl(
			`${startUrl}&additionalData=${additionalData}`,
			{ method: "GET", redirect: "manual" },
		);
		expect(startRes.headers.get("location")).toBeTruthy();

		const ctx = await auth.$context;
		const records = await ctx.adapter.findMany<{ value: string }>({
			model: "verification",
		});
		const stored = records
			.map((record) => {
				try {
					return JSON.parse(record.value) as Record<string, unknown>;
				} catch {
					return undefined;
				}
			})
			.find((value) => value?.tenant === "acme");

		expect(stored).toBeTruthy();
		expect(stored?.tenant).toBe("acme");
		expect(stored?.link).toBeUndefined();
	});

	it("rejects an untrusted callbackURL at start", async () => {
		const res = await customFetchImpl(
			`${popupOrigin}/api/auth/oauth-popup/start?provider=${providerId}&popupOrigin=${encodeURIComponent(popupOrigin)}&popupNonce=n1&callbackURL=${encodeURIComponent("https://evil.example.com")}`,
			{ method: "GET", redirect: "manual" },
		);
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("invalid_callback_url");
	});

	it("rejects an untrusted popup origin", async () => {
		const res = await customFetchImpl(
			`${popupOrigin}/api/auth/oauth-popup/start?provider=${providerId}&popupOrigin=${encodeURIComponent("https://evil.example.com")}&popupNonce=n1`,
			{ method: "GET", redirect: "manual" },
		);
		expect(res.status).toBe(403);
	});
});
