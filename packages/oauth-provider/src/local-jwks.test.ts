import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderResourceClient } from "./client-resource";
import { oauthProvider } from "./oauth";

const origin = "https://local-jwks.example.test";
const baseURL = `${origin}/api/auth`;
const resource = "https://api.example.test";

async function createProvider(jwtPlugin = jwt()) {
	const instance = await getTestInstance({
		baseURL: origin,
		advanced: { useSecureCookies: false },
		plugins: [
			jwtPlugin,
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [resource],
				enforcePerClientResources: false,
				scopes: ["read:posts"],
				clientPrivileges: () => true,
			}),
		],
	});
	const { headers } = await instance.signInWithTestUser();
	const client = await instance.auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: ["client_credentials"],
			redirect_uris: ["https://rp.example.test/callback"],
			client_credentials_scopes: ["read:posts"],
			enable_end_session: true,
		},
	});
	const clientId = client.client_id;
	const clientSecret = client.client_secret!;

	async function issueAccessToken() {
		const tokens = await instance.auth.api.oauth2Token({
			body: {
				grant_type: "client_credentials",
				client_id: clientId,
				client_secret: clientSecret,
				scope: "read:posts",
				resource,
			},
		});
		return tokens.access_token;
	}

	async function introspect(token: string) {
		const response = await instance.customFetchImpl(
			`${baseURL}/oauth2/introspect`,
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					token,
					client_id: clientId,
					client_secret: clientSecret,
				}),
			},
		);
		expect(response.status).toBe(200);
		return (await response.json()) as { active: boolean };
	}

	return { instance, headers, clientId, issueAccessToken, introspect };
}

/** A runtime that cannot send a request to its own hostname. */
function blockSelfRequests() {
	const selfFetch = vi.fn(async (_input: RequestInfo | URL) => {
		throw new TypeError("fetch failed");
	});
	vi.stubGlobal("fetch", selfFetch);
	return selfFetch;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("signing keys shared by one jwt() plugin", () => {
	it("keeps each auth instance's keys for introspection", async () => {
		const sharedJwt = jwt();
		const first = await createProvider(sharedJwt);
		const second = await createProvider(sharedJwt);
		const firstToken = await first.issueAccessToken();
		const secondToken = await second.issueAccessToken();

		expect(await first.introspect(firstToken)).toMatchObject({ active: true });
		expect(await second.introspect(secondToken)).toMatchObject({
			active: true,
		});
		expect(await first.introspect(firstToken)).toMatchObject({ active: true });
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10728
 */
describe("end-session with an id_token_hint", () => {
	it("verifies the hint without requesting the server's own JWKS", async () => {
		const { instance, headers, clientId } = await createProvider();
		const session = await instance.auth.api.getSession({ headers });
		const { token: hint } = await instance.auth.api.signJWT({
			body: {
				payload: {
					iss: baseURL,
					aud: clientId,
					sub: session!.user.id,
					sid: session!.session.id,
				},
			},
		});
		const selfFetch = blockSelfRequests();

		await instance.customFetchImpl(
			`${baseURL}/oauth2/end-session?id_token_hint=${encodeURIComponent(hint)}`,
		);

		expect(selfFetch).not.toHaveBeenCalled();
		expect(await instance.auth.api.getSession({ headers })).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10856
 */
describe("oauthProviderResourceClient with the auth instance", () => {
	it("verifies a token without requesting the server's own JWKS", async () => {
		const { instance, issueAccessToken } = await createProvider();
		const actions = oauthProviderResourceClient(instance.auth).getActions();
		const accessToken = await issueAccessToken();
		const selfFetch = blockSelfRequests();

		const payload = await actions.verifyBearerToken(accessToken, {
			verifyOptions: { audience: resource },
		});

		expect(payload).toMatchObject({ iss: baseURL, aud: resource });
		expect(selfFetch).not.toHaveBeenCalled();
	});

	it("fetches an explicit jwksUrl over HTTP", async () => {
		const { instance, issueAccessToken } = await createProvider();
		const actions = oauthProviderResourceClient(instance.auth).getActions();
		const accessToken = await issueAccessToken();
		const jwksUrl = `${baseURL}/jwks`;
		const routeFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
			instance.customFetchImpl(input, init),
		);
		vi.stubGlobal("fetch", routeFetch);

		await actions.verifyBearerToken(accessToken, {
			verifyOptions: { audience: resource },
			jwksUrl,
		});

		expect(routeFetch).toHaveBeenCalled();
		expect(String(routeFetch.mock.calls[0]![0])).toBe(jwksUrl);
	});
});
