import { createHash } from "node:crypto";
import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const lanOrigin = "http://192.168.1.50:8000";
const lanRedirect = `${lanOrigin}/auth/callback`;
const lanLogoutRedirect = `${lanOrigin}/logged-out`;
const allowLanOrigin = (url: URL) => url.origin === lanOrigin;

async function setupProvider(input: {
	baseURL?: string;
	allowInsecureRedirectUri?: OAuthOptions<Scope[]>["allowInsecureRedirectUri"];
}) {
	const baseURL = input.baseURL ?? "http://localhost:3000";
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowInsecureRedirectUri: input.allowInsecureRedirectUri,
				}),
				jwt(),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();

	function createClient(body: {
		redirect_uris: string[];
		application_type?: "web" | "native";
		post_logout_redirect_uris?: string[];
	}) {
		return auth.api.adminCreateOAuthClient({
			headers,
			body: {
				...body,
				token_endpoint_auth_method: "none",
				skip_consent: true,
				enable_end_session: true,
			},
		});
	}

	async function authorize(clientId: string, redirectUri: string) {
		const codeVerifier = generateRandomString(43);
		const url = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		url.searchParams.set("client_id", clientId);
		url.searchParams.set("redirect_uri", redirectUri);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", "openid");
		url.searchParams.set("state", "state");
		url.searchParams.set(
			"code_challenge",
			createHash("sha256").update(codeVerifier).digest("base64url"),
		);
		url.searchParams.set("code_challenge_method", "S256");

		let location: URL | undefined;
		await client.$fetch(url.toString(), {
			headers,
			redirect: "manual",
			onResponse(context) {
				const header = context.response.headers.get("location");
				if (header) location = new URL(header, baseURL);
			},
		});
		if (!location)
			throw new Error("Expected the authorize endpoint to redirect");
		return { location, codeVerifier };
	}

	async function exchangeCode(input: {
		clientId: string;
		code: string;
		codeVerifier: string;
		redirectUri: string;
	}) {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/oauth2/token`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "authorization_code",
					client_id: input.clientId,
					code: input.code,
					code_verifier: input.codeVerifier,
					redirect_uri: input.redirectUri,
				}),
			}),
		);
		return {
			status: response.status,
			body: (await response.json()) as { id_token?: string },
		};
	}

	function endSession(clientId: string, postLogoutRedirectUri: string) {
		const url = new URL(`${baseURL}/api/auth/oauth2/end-session`);
		url.searchParams.set("client_id", clientId);
		url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
		const requestHeaders = new Headers(headers);
		requestHeaders.set("accept", "text/html");
		return auth.handler(
			new Request(url, { headers: requestHeaders, redirect: "manual" }),
		);
	}

	async function replaceRegisteredUris(
		clientId: string,
		update: { redirectUris?: string[]; postLogoutRedirectUris?: string[] },
	) {
		const context = await auth.$context;
		await context.adapter.update({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
			update,
		});
	}

	return {
		auth,
		baseURL,
		createClient,
		authorize,
		exchangeCode,
		endSession,
		replaceRegisteredUris,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11277
 */
describe("http redirect URIs on private networks", () => {
	it("rejects a non-loopback http redirect URI at registration by default", async () => {
		const provider = await setupProvider({});

		await expect(
			provider.createClient({ redirect_uris: [lanRedirect] }),
		).rejects.toThrow();
	});

	it("shows the server error page instead of redirecting to a registered http URI the policy rejects", async () => {
		const provider = await setupProvider({});
		const client = await provider.createClient({
			redirect_uris: ["https://rp.example.com/callback"],
		});
		await provider.replaceRegisteredUris(client.client_id, {
			redirectUris: [lanRedirect],
		});

		const { location } = await provider.authorize(
			client.client_id,
			lanRedirect,
		);

		expect(location.origin).toBe(provider.baseURL);
		expect(location.pathname).toBe("/api/auth/error");
		expect(location.searchParams.get("error")).toBe("invalid_request");
	});

	it("accepts an http redirect URI the predicate allows through authorize and token", async () => {
		const provider = await setupProvider({
			allowInsecureRedirectUri: allowLanOrigin,
		});
		const client = await provider.createClient({
			redirect_uris: [lanRedirect],
		});

		const { location, codeVerifier } = await provider.authorize(
			client.client_id,
			lanRedirect,
		);
		expect(`${location.origin}${location.pathname}`).toBe(lanRedirect);
		const code = location.searchParams.get("code");
		expect(code).toBeTypeOf("string");

		const token = await provider.exchangeCode({
			clientId: client.client_id,
			code: code!,
			codeVerifier,
			redirectUri: lanRedirect,
		});
		expect(token.status).toBe(200);
		expect(token.body.id_token).toBeTypeOf("string");
	});

	it("rejects an http origin the predicate does not allow", async () => {
		const provider = await setupProvider({
			allowInsecureRedirectUri: allowLanOrigin,
		});

		await expect(
			provider.createClient({
				redirect_uris: ["http://10.0.0.5:8000/callback"],
			}),
		).rejects.toThrow();
		await expect(
			provider.createClient({
				redirect_uris: ["https://rp.example.com/callback"],
				post_logout_redirect_uris: ["http://10.0.0.5:8000/logged-out"],
			}),
		).rejects.toThrow();
	});

	it("fails closed when the predicate throws", async () => {
		const provider = await setupProvider({
			allowInsecureRedirectUri: () => {
				throw new Error("policy unavailable");
			},
		});

		await expect(
			provider.createClient({ redirect_uris: [lanRedirect] }),
		).rejects.toThrow();
	});

	it("accepts an http post-logout redirect URI the predicate allows", async () => {
		const provider = await setupProvider({
			allowInsecureRedirectUri: allowLanOrigin,
		});
		const client = await provider.createClient({
			redirect_uris: [lanRedirect],
			post_logout_redirect_uris: [lanLogoutRedirect],
		});

		const response = await provider.endSession(
			client.client_id,
			lanLogoutRedirect,
		);

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("data-oidc-logout-confirmation");
	});

	it("rejects a registered http post-logout redirect URI the policy rejects", async () => {
		const provider = await setupProvider({});
		const client = await provider.createClient({
			redirect_uris: ["https://rp.example.com/callback"],
		});
		await provider.replaceRegisteredUris(client.client_id, {
			postLogoutRedirectUris: [lanLogoutRedirect],
		});

		const response = await provider.endSession(
			client.client_id,
			lanLogoutRedirect,
		);

		expect(response.status).toBe(400);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11445
 */
describe("web clients on localhost", () => {
	const localhostRedirect = "http://localhost:5173/auth/callback";

	it("rejects a web client localhost redirect URI by default", async () => {
		const provider = await setupProvider({});

		await expect(
			provider.createClient({
				redirect_uris: [localhostRedirect],
				application_type: "web",
			}),
		).rejects.toThrow();
	});

	it("accepts a web client localhost redirect URI the predicate allows", async () => {
		const provider = await setupProvider({
			allowInsecureRedirectUri: (url) => url.hostname === "localhost",
		});

		const client = await provider.createClient({
			redirect_uris: [localhostRedirect],
			application_type: "web",
		});
		const { location } = await provider.authorize(
			client.client_id,
			localhostRedirect,
		);

		expect(client.redirect_uris).toEqual([localhostRedirect]);
		expect(`${location.origin}${location.pathname}`).toBe(localhostRedirect);
		expect(location.searchParams.get("code")).toBeTypeOf("string");
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11740
 */
describe("http issuer on a private network", () => {
	it("uses the configured http issuer in discovery, the authorization response, and the ID token", async () => {
		const provider = await setupProvider({ baseURL: "http://10.0.0.5:3000" });
		const expectedIssuer = "http://10.0.0.5:3000/api/auth";
		const redirectUri = "https://rp.example.com/callback";
		const client = await provider.createClient({
			redirect_uris: [redirectUri],
		});

		const discovery = await provider.auth.api.getOpenIdConfig();
		const { location, codeVerifier } = await provider.authorize(
			client.client_id,
			redirectUri,
		);
		const token = await provider.exchangeCode({
			clientId: client.client_id,
			code: location.searchParams.get("code")!,
			codeVerifier,
			redirectUri,
		});

		expect(discovery.issuer).toBe(expectedIssuer);
		expect(location.searchParams.get("iss")).toBe(expectedIssuer);
		expect(decodeJwt(token.body.id_token!).iss).toBe(expectedIssuer);
	});
});
