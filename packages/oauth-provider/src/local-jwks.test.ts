import type { Jwk } from "better-auth/plugins/jwt";
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

	async function issueAccessToken(headers?: Record<string, string>) {
		const tokens = await instance.auth.api.oauth2Token({
			headers,
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

	async function introspect(token: string, headers?: Record<string, string>) {
		const response = await instance.customFetchImpl(
			`${baseURL}/oauth2/introspect`,
			{
				method: "POST",
				headers: {
					"content-type": "application/x-www-form-urlencoded",
					...headers,
				},
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

	async function revoke(token: string, headers?: Record<string, string>) {
		return instance.customFetchImpl(`${baseURL}/oauth2/revoke`, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...headers,
			},
			body: new URLSearchParams({
				token,
				token_type_hint: "access_token",
				client_id: clientId,
				client_secret: clientSecret,
			}),
		});
	}

	return {
		instance,
		headers,
		clientId,
		issueAccessToken,
		introspect,
		revoke,
	};
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

describe("a custom jwt adapter.getJwks", () => {
	const tenantHeader = "x-tenant";

	/** Picks signing keys by a request header, as a multi-tenant key store does. */
	function tenantKeyStore() {
		const tenantsSeen: (string | null | undefined)[] = [];
		const plugin = jwt({
			adapter: {
				getJwks: async (ctx) => {
					tenantsSeen.push(ctx.headers?.get(tenantHeader));
					return ctx.context.adapter.findMany<Jwk>({ model: "jwks" });
				},
			},
		});
		return { plugin, tenantsSeen };
	}

	it("receives the introspection request", async () => {
		const { plugin, tenantsSeen } = tenantKeyStore();
		const { introspect, issueAccessToken } = await createProvider(plugin);
		const token = await issueAccessToken();
		tenantsSeen.length = 0;

		expect(await introspect(token, { [tenantHeader]: "acme" })).toMatchObject({
			active: true,
		});
		expect(tenantsSeen).toEqual(["acme"]);
	});

	it("receives the revocation request", async () => {
		const { plugin, tenantsSeen } = tenantKeyStore();
		const { revoke, issueAccessToken } = await createProvider(plugin);
		const token = await issueAccessToken();
		tenantsSeen.length = 0;

		const response = await revoke(token, { [tenantHeader]: "acme" });

		// A verified JWT access token is self-contained, so revocation reports it
		// as unsupported after reading the keys.
		expect(await response.json()).toMatchObject({
			error: "unsupported_token_type",
		});
		expect(tenantsSeen).toEqual(["acme"]);
	});

	it("receives the end-session request", async () => {
		const { plugin, tenantsSeen } = tenantKeyStore();
		const { instance, headers, clientId } = await createProvider(plugin);
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
		tenantsSeen.length = 0;

		await instance.customFetchImpl(
			`${baseURL}/oauth2/end-session?id_token_hint=${encodeURIComponent(hint)}`,
			{ headers: { [tenantHeader]: "acme" } },
		);

		expect(tenantsSeen).toEqual(["acme"]);
		expect(await instance.auth.api.getSession({ headers })).toBeNull();
	});

	/**
	 * Each tenant has its own signing keys. A key loaded for one tenant must
	 * not verify a token presented in another tenant's request.
	 */
	it("is asked again for every verification", async () => {
		const keysByTenant = new Map<string, Jwk[]>();
		const tenantOf = (ctx: { headers?: Headers | undefined }) =>
			ctx.headers?.get(tenantHeader) ?? "none";
		const plugin = jwt({
			adapter: {
				getJwks: async (ctx) => keysByTenant.get(tenantOf(ctx)) ?? [],
				createJwk: async (data, ctx) => {
					const key = { ...data, id: crypto.randomUUID() };
					const tenant = tenantOf(ctx);
					keysByTenant.set(tenant, [...(keysByTenant.get(tenant) ?? []), key]);
					return key;
				},
			},
		});
		const { introspect, issueAccessToken } = await createProvider(plugin);
		const acmeToken = await issueAccessToken({ [tenantHeader]: "acme" });
		await issueAccessToken({ [tenantHeader]: "globex" });

		expect(
			await introspect(acmeToken, { [tenantHeader]: "acme" }),
		).toMatchObject({ active: true });
		expect(
			await introspect(acmeToken, { [tenantHeader]: "globex" }),
		).toMatchObject({ active: false });
	});
});
