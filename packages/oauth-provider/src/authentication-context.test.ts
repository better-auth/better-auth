import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { APIError } from "better-call";
import { decodeJwt } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { oauthProvider } from "./oauth";
import type { OAuthAuthenticationContextOptions, Scope } from "./types";
import type { OAuthClient } from "./types/oauth";

type Resolve = NonNullable<
	OAuthAuthenticationContextOptions<Scope[]>["resolve"]
>;

const MFA_ACR = "urn:example:acr:mfa";

describe("oauth-provider authenticationContext", async () => {
	const authServerBaseUrl = "http://localhost:3000";
	const redirectUri = "http://localhost:5000/api/auth/callback/test";
	const resolve = vi.fn<Resolve>();
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL: authServerBaseUrl,
		plugins: [
			jwt({ jwt: { issuer: authServerBaseUrl } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				authenticationContext: {
					acrValuesSupported: ["0", MFA_ACR],
					resolve,
				},
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();

	let oauthClient: OAuthClient | null;
	beforeAll(async () => {
		oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: ["authorization_code", "refresh_token"],
				redirect_uris: [redirectUri],
				application_type: "native",
				skip_consent: true,
			},
		});
	});
	beforeEach(() => {
		resolve.mockReset();
		resolve.mockResolvedValue({ acr: MFA_ACR, amr: ["pwd", "otp"] });
	});

	function clientOptions() {
		if (!oauthClient?.client_id || !oauthClient.client_secret) {
			throw new Error("beforeAll not run properly");
		}
		return {
			clientId: oauthClient.client_id,
			clientSecret: oauthClient.client_secret,
			redirectURI: redirectUri,
		};
	}

	async function authorize(params: {
		claims?: Record<string, unknown>;
		acrValues?: string;
		scopes?: string[];
	}) {
		const codeVerifier = generateRandomString(43);
		const url = await createAuthorizationURL({
			id: "test",
			options: clientOptions(),
			redirectURI: "",
			authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
			state: "acr-state",
			scopes: params.scopes ?? ["openid", "offline_access"],
			codeVerifier,
		});
		if (params.claims) {
			url.searchParams.set("claims", JSON.stringify(params.claims));
		}
		if (params.acrValues) {
			url.searchParams.set("acr_values", params.acrValues);
		}
		let location = "";
		await client.$fetch(url.toString(), {
			headers,
			onError(context) {
				location = context.response.headers.get("Location") || "";
			},
		});
		return { callback: new URL(location), codeVerifier };
	}

	async function requestTokens(request: {
		body: URLSearchParams;
		headers: Record<string, string>;
	}) {
		const tokens = await client.$fetch<{
			id_token: string;
			refresh_token: string;
		}>("/oauth2/token", { method: "POST", ...request });
		return tokens.data!;
	}

	async function authorizeAndExchange(params: Parameters<typeof authorize>[0]) {
		const { callback, codeVerifier } = await authorize(params);
		return requestTokens(
			await authorizationCodeRequest({
				code: callback.searchParams.get("code")!,
				codeVerifier,
				redirectURI: redirectUri,
				options: clientOptions(),
			}),
		);
	}

	async function refresh(refreshToken: string) {
		return requestTokens(
			await refreshAccessTokenRequest({
				refreshToken,
				options: clientOptions(),
			}),
		);
	}

	function expectErrorRedirect(callback: URL, error: string) {
		expect(callback.origin + callback.pathname).toBe(redirectUri);
		expect(callback.searchParams.get("error")).toBe(error);
		expect(callback.searchParams.get("state")).toBe("acr-state");
		expect(callback.searchParams.get("code")).toBeNull();
	}

	function essentialAcr(value: string) {
		return { id_token: { acr: { essential: true, value } } };
	}

	it("advertises the configured acr values in discovery", async () => {
		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata.acr_values_supported).toEqual(["0", MFA_ACR]);
	});

	it("passes the session, client, scopes, headers and requested acr values to the resolver", async () => {
		const { callback } = await authorize({
			claims: { id_token: { acr: { values: [MFA_ACR] } } },
			acrValues: `0 ${MFA_ACR}`,
		});
		expect(callback.searchParams.get("code")).toEqual(expect.any(String));
		expect(resolve).toHaveBeenCalledOnce();
		const info = resolve.mock.calls[0]![0];
		expect(info.user.id).toBe(user.id);
		expect(info.session.userId).toBe(user.id);
		expect(info.client.clientId).toBe(oauthClient?.client_id);
		expect(info.scopes).toEqual(["openid", "offline_access"]);
		expect(info.headers).toBeInstanceOf(Headers);
		expect(info.requestedAcrValues).toEqual([MFA_ACR, "0"]);
	});

	it("persists acr and amr across code exchange and refresh rotation", async () => {
		const tokens = await authorizeAndExchange({
			claims: essentialAcr(MFA_ACR),
		});
		const idToken = decodeJwt(tokens.id_token);
		expect(idToken.acr).toBe(MFA_ACR);
		expect(idToken.amr).toEqual(["pwd", "otp"]);

		// The session's context changing later must not alter refreshed ID
		// tokens: they describe the original authentication (OIDC Core §12.2).
		resolve.mockResolvedValue({ acr: "0" });
		const rotated = await refresh(tokens.refresh_token);
		const rotatedAgain = await refresh(rotated.refresh_token);
		for (const { id_token } of [rotated, rotatedAgain]) {
			const claims = decodeJwt(id_token);
			expect(claims.acr).toBe(MFA_ACR);
			expect(claims.amr).toEqual(["pwd", "otp"]);
			expect(claims.auth_time).toBe(idToken.auth_time);
		}
		expect(resolve).toHaveBeenCalledOnce();
	});

	it("rejects an essential acr the session does not satisfy", async () => {
		resolve.mockResolvedValue({ acr: "0", amr: ["pwd"] });
		const { callback } = await authorize({ claims: essentialAcr(MFA_ACR) });
		expectErrorRedirect(callback, "access_denied");
	});

	it("does not resolve requests without the openid scope", async () => {
		const { callback } = await authorize({ scopes: ["offline_access"] });
		expect(callback.searchParams.get("code")).toEqual(expect.any(String));
		expect(resolve).not.toHaveBeenCalled();
	});

	it("rejects an essential acr outside acrValuesSupported before resolving", async () => {
		const { callback } = await authorize({
			claims: essentialAcr("urn:example:acr:unknown"),
		});
		expect(callback.searchParams.get("error")).toBe("access_denied");
		expect(resolve).not.toHaveBeenCalled();
	});

	it.each([
		["acr_values", { acrValues: MFA_ACR }],
		[
			"a voluntary acr claim",
			{ claims: { id_token: { acr: { value: MFA_ACR } } } },
		],
	])(
		"issues the session's current acr for %s it does not satisfy",
		async (_, request) => {
			resolve.mockResolvedValue({ acr: "0" });
			const tokens = await authorizeAndExchange(request);
			const idToken = decodeJwt(tokens.id_token);
			expect(idToken.acr).toBe("0");
			expect(idToken.amr).toBeUndefined();
		},
	);

	it.each<[string, unknown]>([
		["an acr outside acrValuesSupported", { acr: "urn:example:acr:unknown" }],
		["a non-string acr", { acr: 2 }],
		["a non-array amr", { acr: MFA_ACR, amr: "otp" }],
		["an amr with non-string entries", { acr: MFA_ACR, amr: ["pwd", 1] }],
	])("returns server_error when the resolver returns %s", async (_, result) => {
		resolve.mockResolvedValue(result as Awaited<ReturnType<Resolve>>);
		const { callback } = await authorize({});
		expectErrorRedirect(callback, "server_error");
	});

	it("returns the OAuth error a resolver throws", async () => {
		resolve.mockRejectedValue(
			new APIError("FORBIDDEN", {
				error: "access_denied",
				error_description: "account locked",
			}),
		);
		const { callback } = await authorize({});
		expectErrorRedirect(callback, "access_denied");
		expect(callback.searchParams.get("error_description")).toBe(
			"account locked",
		);
	});
});

describe("oauth-provider authenticationContext setup", () => {
	it("rejects an empty acrValuesSupported", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				authenticationContext: {
					acrValuesSupported: [],
					resolve: () => undefined,
				},
			}),
		).toThrow("acrValuesSupported must list at least one acr value");
	});
});
