import { createAuthEndpoint } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { OAuthOptions, Scope } from "./types";

const baseURL = "http://localhost:3000";
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const redirectUri = "https://rp.example.com/callback";
const opaqueResource = "https://internal.example.com";
const jwtResource = "https://api.example.com";
const explicitJwtResource = "https://reports.example.com";

/** A protected resource served by the authorization server's own instance. */
const resourcePlugin = {
	id: "test-access-token-format-resource",
	endpoints: {
		testFormatResource: createAuthEndpoint(
			"/test/format-resource",
			{
				method: "GET",
				query: z.object({ audience: z.string() }),
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const claims = await provider.verifyResourceRequest({
					audience: ctx.query.audience,
				});
				return ctx.json({ aud: claims.aud });
			},
		),
	},
} satisfies BetterAuthPlugin;

async function setup(
	options: Partial<OAuthOptions<Scope[]>> = {},
	{ withJwtPlugin = true }: { withJwtPlugin?: boolean } = {},
) {
	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			resourcePlugin,
			...(withJwtPlugin ? [jwt({ jwt: { issuer: baseURL } })] : []),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resources: [
					{ identifier: opaqueResource, accessTokenFormat: "opaque" },
					jwtResource,
				],
				enforcePerClientResources: false,
				scopes: ["openid", "profile", "email", "offline_access", "read"],
				clientPrivileges: () => true,
				...options,
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const client = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
			grant_types: [
				"authorization_code",
				"refresh_token",
				"client_credentials",
			],
			client_credentials_scopes: ["read"],
			scope: "openid profile email offline_access read",
			skip_consent: true,
		},
	});
	const clientAuth = {
		client_id: client.client_id,
		client_secret: client.client_secret!,
	};

	async function postToken(body: Record<string, string | string[]>) {
		const params = new URLSearchParams(clientAuth);
		for (const [key, value] of Object.entries(body)) {
			for (const item of [value].flat()) params.append(key, item);
		}
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: params.toString(),
		});
		return {
			status: response.status,
			body: (await response.json()) as Record<string, string>,
		};
	}

	function clientCredentials(resource?: string | string[]) {
		return postToken({
			grant_type: "client_credentials",
			scope: "read",
			...(resource ? { resource } : {}),
		});
	}

	/** Runs an authorization code grant for `resource` with `openid` and refresh. */
	async function authorizationCode(resource: string) {
		const codeVerifier = generateRandomString(43);
		const url = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		for (const [key, value] of Object.entries({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: redirectUri,
			scope: "openid offline_access",
			state: "format-state",
			code_challenge: await generateCodeChallenge(codeVerifier),
			code_challenge_method: "S256",
			resource,
		})) {
			url.searchParams.set(key, value);
		}
		const response = await customFetchImpl(url.toString(), {
			headers,
			redirect: "manual",
		});
		const location = new URL(response.headers.get("Location") ?? "", baseURL);
		const code = location.searchParams.get("code");
		if (!code) throw new Error(`authorization failed: ${location}`);
		return postToken({
			grant_type: "authorization_code",
			code,
			code_verifier: codeVerifier,
			redirect_uri: redirectUri,
			resource,
		});
	}

	function refresh(refreshToken: string) {
		return postToken({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
		});
	}

	function introspect(token: string) {
		return auth.api.oauth2Introspect({ body: { token, ...clientAuth } });
	}

	function callResource(token: string, audience: string) {
		const url = new URL(`${baseURL}/api/auth/test/format-resource`);
		url.searchParams.set("audience", audience);
		return customFetchImpl(url, {
			headers: { authorization: `Bearer ${token}` },
		});
	}

	return {
		auth,
		headers,
		clientCredentials,
		authorizationCode,
		refresh,
		introspect,
		callResource,
	};
}

function isJwt(token: string | undefined) {
	return token?.split(".").length === 3;
}

describe("per-resource access token format", () => {
	it("issues an opaque token bound to an opaque-format resource", async () => {
		const { clientCredentials, introspect, callResource } = await setup();
		const { status, body } = await clientCredentials(opaqueResource);
		expect(status).toBe(200);
		expect(isJwt(body.access_token)).toBe(false);

		const introspection = await introspect(body.access_token!);
		expect(introspection).toMatchObject({ active: true, aud: opaqueResource });

		const accepted = await callResource(body.access_token!, opaqueResource);
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toEqual({ aud: opaqueResource });

		const refused = await callResource(body.access_token!, jwtResource);
		expect(refused.status).toBe(401);
	});

	it("keeps issuing JWTs for a resource without a format", async () => {
		const { clientCredentials } = await setup();
		const { body } = await clientCredentials(jwtResource);
		expect(isJwt(body.access_token)).toBe(true);
		expect(decodeJwt(body.access_token!).aud).toBe(jwtResource);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8707#section-2.2
	 */
	it("refuses a request that mixes JWT and opaque resources", async () => {
		const { clientCredentials } = await setup();
		const { status, body } = await clientCredentials([
			opaqueResource,
			jwtResource,
		]);
		expect(status).toBe(400);
		expect(body.error).toBe("invalid_target");
	});

	it("keeps the opaque format and audience on refresh", async () => {
		const { authorizationCode, refresh, introspect } = await setup();
		const initial = await authorizationCode(opaqueResource);
		expect(initial.status).toBe(200);
		expect(isJwt(initial.body.access_token)).toBe(false);

		const refreshed = await refresh(initial.body.refresh_token!);
		expect(refreshed.status).toBe(200);
		expect(isJwt(refreshed.body.access_token)).toBe(false);
		const introspection = await introspect(refreshed.body.access_token!);
		expect(introspection.active).toBe(true);
		expect([introspection.aud].flat()).toContain(opaqueResource);
	});

	it("issues opaque tokens when the JWT plugin is disabled", async () => {
		const { clientCredentials } = await setup(
			{ disableJwtPlugin: true, storeClientSecret: "encrypted" },
			{ withJwtPlugin: false },
		);
		const { status, body } = await clientCredentials(jwtResource);
		expect(status).toBe(200);
		expect(isJwt(body.access_token)).toBe(false);
	});
});

describe("access token format managed at runtime", () => {
	it("follows the stored format as an admin changes it", async () => {
		const { auth, headers, clientCredentials } = await setup({
			resourceDefaults: { accessTokenFormat: "opaque" },
		});
		const identifier = "https://managed.example.com";
		await auth.api.adminCreateOAuthResource({
			body: { identifier, accessTokenFormat: "jwt" },
			headers,
		});
		expect(isJwt((await clientCredentials(identifier)).body.access_token)).toBe(
			true,
		);

		const updated = await auth.api.adminUpdateOAuthResource({
			params: { identifier },
			body: { accessTokenFormat: null },
			headers,
		});
		expect(updated).toMatchObject({ accessTokenFormat: null });
		expect(isJwt((await clientCredentials(identifier)).body.access_token)).toBe(
			false,
		);
	});

	it("rejects an unsupported format", async () => {
		const { auth, headers } = await setup();
		await expect(
			auth.api.adminCreateOAuthResource({
				body: {
					identifier: "https://managed.example.com",
					accessTokenFormat: "reference" as never,
				},
				headers,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it("deactivates opaque tokens when their resource is deleted", async () => {
		const { auth, headers, clientCredentials, introspect } = await setup();
		const { body } = await clientCredentials(opaqueResource);
		expect((await introspect(body.access_token!)).active).toBe(true);

		await auth.api.adminDeleteOAuthResource({
			params: { identifier: opaqueResource },
			headers,
		});
		expect((await introspect(body.access_token!)).active).toBe(false);
	});
});

describe("resourceDefaults", () => {
	it("makes resources without a format opaque", async () => {
		const { clientCredentials } = await setup({
			resourceDefaults: { accessTokenFormat: "opaque" },
			resources: [
				jwtResource,
				{ identifier: explicitJwtResource, accessTokenFormat: "jwt" },
			],
		});
		const defaulted = await clientCredentials(jwtResource);
		expect(isJwt(defaulted.body.access_token)).toBe(false);
		const overridden = await clientCredentials(explicitJwtResource);
		expect(isJwt(overridden.body.access_token)).toBe(true);
	});

	it("rejects an unsupported default format at startup", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				resourceDefaults: { accessTokenFormat: "reference" as never },
			}),
		).toThrow(/resourceDefaults\.accessTokenFormat/);
	});
});
