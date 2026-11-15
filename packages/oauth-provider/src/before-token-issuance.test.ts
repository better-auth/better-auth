import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { User } from "better-auth/types";
import { APIError } from "better-call";
import { decodeJwt } from "jose";
import { beforeEach, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { createDpopKey, createDpopProof } from "./test-utils/dpop";
import type { OAuthBeforeTokenIssuanceInput } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";
const extensionGrant = "urn:better-auth:test:policy-grant";
const formHeaders = {
	accept: "application/json",
	"content-type": "application/x-www-form-urlencoded",
};

function refusal() {
	return new APIError("BAD_REQUEST", {
		error: "invalid_grant",
		error_description: "assurance level not met",
	});
}

function consumed() {
	return new APIError("BAD_REQUEST", {
		error: "invalid_grant",
		error_description: "request already redeemed",
	});
}

async function setup() {
	const events: string[] = [];
	const inputs: OAuthBeforeTokenIssuanceInput[] = [];
	const policy = {
		refuse: false,
		refuseInExtension: false,
		mutate: false,
		mutateInExtension: false,
		failToConsume: false,
	};
	let grantUser: User | undefined;
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "profile", "email", "offline_access", "read"],
					clientPrivileges: () => true,
					beforeTokenIssuance: (input) => {
						events.push("beforeTokenIssuance");
						inputs.push(input);
						if (policy.refuse) throw refusal();
						if (policy.mutate) {
							input.scopes.push("email");
							input.authTime?.setTime(0);
						}
					},
					customTokenResponseFields: () => {
						events.push("customTokenResponseFields");
						return {};
					},
					extensions: [
						{
							beforeTokenIssuance: (input) => {
								events.push(`extension:${input.grantType}`);
								if (policy.refuseInExtension) throw refusal();
								if (policy.mutateInExtension) input.scopes.push("email");
							},
							grants: {
								[extensionGrant]: async ({ provider }) => {
									const { client } = await provider.authenticateClient();
									return provider.issueTokens({
										client,
										scopes: ["openid", "offline_access"],
										user: grantUser,
										acr: "urn:example:loa:2",
										amr: ["hwk"],
										grantRequest: { id: "request-1", device: "kiosk" },
										consumeCredential: () => {
											events.push("consumeCredential");
											if (policy.failToConsume) throw consumed();
										},
									});
								},
							},
						},
					],
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers, user } = await signInWithTestUser();
	grantUser = user;
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [redirectUri],
			application_type: "native",
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [
				"authorization_code",
				"refresh_token",
				"client_credentials",
				extensionGrant,
			],
			scope: "openid profile email offline_access read",
			client_credentials_scopes: ["read"],
			skip_consent: true,
		},
	});
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	return { auth, client, headers, user, options, events, inputs, policy };
}

type TestServer = Awaited<ReturnType<typeof setup>>;

interface TokenResponse {
	access_token: string;
	id_token?: string;
	refresh_token?: string;
	token_type: string;
	scope: string;
}

/** Gets an authorization code and returns a function that redeems it. */
async function authorizeCode(
	{ client, headers, options }: TestServer,
	{ offline = false } = {},
) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", "profile", ...(offline ? ["offline_access"] : [])],
		codeVerifier,
	});
	let callbackRedirectUrl = "";
	await client.$fetch(authUrl.toString(), {
		headers,
		onError(context) {
			callbackRedirectUrl = context.response.headers.get("Location") || "";
		},
	});
	const code = new URL(callbackRedirectUrl).searchParams.get("code")!;
	return async (extraHeaders?: Record<string, string>) => {
		const { body, headers: tokenHeaders } = await authorizationCodeRequest({
			code,
			codeVerifier,
			redirectURI: redirectUri,
			options,
		});
		return client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body,
			headers: { ...tokenHeaders, ...extraHeaders },
		});
	};
}

function requestRefresh({ client, options }: TestServer, refreshToken: string) {
	return refreshAccessTokenRequest({ refreshToken, options }).then(
		({ body, headers }) =>
			client.$fetch<TokenResponse>("/oauth2/token", {
				method: "POST",
				body,
				headers,
			}),
	);
}

function requestTokens(
	{ client, options }: TestServer,
	params: Record<string, string>,
) {
	return client.$fetch<TokenResponse>("/oauth2/token", {
		method: "POST",
		headers: formHeaders,
		body: new URLSearchParams({
			client_id: options.clientId,
			client_secret: options.clientSecret,
			...params,
		}),
	});
}

function oauthError(response: { error: unknown }) {
	return (response.error as { error?: string } | null)?.error;
}

async function countTokenRows({ auth, options }: TestServer) {
	const ctx = await auth.$context;
	const where = [{ field: "clientId", value: options.clientId }];
	const [accessTokens, refreshTokens] = await Promise.all([
		ctx.adapter.count({ model: "oauthAccessToken", where }),
		ctx.adapter.count({ model: "oauthRefreshToken", where }),
	]);
	return accessTokens + refreshTokens;
}

/**
 * @see https://github.com/better-auth/better-auth/issues/10407
 */
describe("oauth-provider - beforeTokenIssuance", async () => {
	const server = await setup();

	beforeEach(() => {
		server.events.length = 0;
		server.inputs.length = 0;
		server.policy.refuse = false;
		server.policy.refuseInExtension = false;
		server.policy.mutate = false;
		server.policy.mutateInExtension = false;
		server.policy.failToConsume = false;
	});

	it("runs once for an authorization code, before customTokenResponseFields, with the grant's context", async () => {
		const redeem = await authorizeCode(server);
		const response = await redeem();

		expect(response.error).toBeNull();
		expect(server.events).toEqual([
			"extension:authorization_code",
			"beforeTokenIssuance",
			"customTokenResponseFields",
		]);
		const [input] = server.inputs;
		expect(input).toMatchObject({
			grantType: "authorization_code",
			client: { clientId: server.options.clientId },
			user: { id: server.user.id },
			scopes: ["openid", "profile"],
			sessionId: expect.any(String),
			authTime: expect.any(Date),
			grantId: expect.any(String),
			verificationValue: {
				type: "authorization_code",
				query: { client_id: server.options.clientId, scope: "openid profile" },
			},
		});
		expect(input!.confirmation).toBeUndefined();
		expect(input!.ctx.context.baseURL).toContain(authServerBaseUrl);
	});

	it("passes the refusal through and stores no token when the hook throws", async () => {
		const redeem = await authorizeCode(server, { offline: true });
		const rowsBefore = await countTokenRows(server);
		server.policy.refuse = true;

		const refused = await redeem();

		expect(refused.error).toMatchObject({
			status: 400,
			error: "invalid_grant",
			error_description: "assurance level not met",
		});
		expect(server.events).not.toContain("customTokenResponseFields");
		expect(await countTokenRows(server)).toBe(rowsBefore);

		// The code was consumed before the hook ran, so a refusal is final.
		server.policy.refuse = false;
		const retried = await redeem();
		expect(oauthError(retried)).toBe("invalid_grant");
	});

	it("leaves the presented refresh token usable after a refused refresh", async () => {
		const tokens = (await (await authorizeCode(server, { offline: true }))())
			.data!;
		server.policy.refuse = true;

		const refused = await requestRefresh(server, tokens.refresh_token!);
		expect(oauthError(refused)).toBe("invalid_grant");

		server.policy.refuse = false;
		const refreshed = await requestRefresh(server, tokens.refresh_token!);
		expect(refreshed.error).toBeNull();
		expect(refreshed.data?.refresh_token).toEqual(expect.any(String));
		const refreshInput = server.inputs.at(-1)!;
		expect(refreshInput.grantType).toBe("refresh_token");
		expect(refreshInput.user?.id).toBe(server.user.id);
		expect(refreshInput.verificationValue).toBeUndefined();
	});

	it("cannot change the issued scopes or authentication time by changing its input", async () => {
		server.policy.mutate = true;

		const response = await (await authorizeCode(server))();

		expect(response.error).toBeNull();
		expect(response.data).toMatchObject({ scope: "openid profile" });
		expect(decodeJwt(response.data!.id_token!).auth_time).toBeGreaterThan(0);
	});

	it("gives each hook its own copy of the issuance's values", async () => {
		server.policy.mutateInExtension = true;

		const response = await (await authorizeCode(server))();

		expect(response.error).toBeNull();
		expect(server.inputs[0]!.scopes).toEqual(["openid", "profile"]);
	});

	it("does not reach customTokenResponseFields when the DPoP proof is rejected", async () => {
		const key = await createDpopKey();

		const response = await server.client.$fetch("/oauth2/token", {
			method: "POST",
			headers: {
				...formHeaders,
				DPoP: await createDpopProof(key, {
					url: `${authServerBaseUrl}/api/auth/oauth2/other`,
				}),
			},
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: server.options.clientId,
				client_secret: server.options.clientSecret,
				scope: "read",
			}),
		});

		expect(oauthError(response)).toBe("invalid_dpop_proof");
		expect(server.events).toEqual([]);
	});

	it("runs for client credentials without a user", async () => {
		const response = await requestTokens(server, {
			grant_type: "client_credentials",
			scope: "read",
		});

		expect(response.error).toBeNull();
		expect(server.inputs).toHaveLength(1);
		expect(server.inputs[0]).toMatchObject({
			grantType: "client_credentials",
			scopes: ["read"],
		});
		expect(server.inputs[0]!.user).toBeUndefined();
		expect(server.inputs[0]!.grantId).toBeUndefined();
	});

	it("receives the DPoP confirmation the tokens will be bound to", async () => {
		const key = await createDpopKey();
		const redeem = await authorizeCode(server);

		const response = await redeem({
			DPoP: await createDpopProof(key, { url: tokenEndpoint }),
		});

		expect(response.error).toBeNull();
		expect(response.data?.token_type).toBe("DPoP");
		expect(server.inputs[0]!.confirmation).toEqual({ jkt: key.jkt });
	});

	it("runs for an extension grant with the request it passes to issueTokens", async () => {
		const response = await requestTokens(server, {
			grant_type: extensionGrant,
		});

		expect(response.error).toBeNull();
		expect(server.events.slice(0, 2)).toEqual([
			`extension:${extensionGrant}`,
			"beforeTokenIssuance",
		]);
		expect(server.inputs[0]).toMatchObject({
			grantType: extensionGrant,
			acr: "urn:example:loa:2",
			amr: ["hwk"],
			grantRequest: { id: "request-1", device: "kiosk" },
		});
	});

	it("consumes the grant's credential after every hook and before any response callback", async () => {
		const response = await requestTokens(server, {
			grant_type: extensionGrant,
		});

		expect(response.error).toBeNull();
		expect(server.events).toEqual([
			`extension:${extensionGrant}`,
			"beforeTokenIssuance",
			"consumeCredential",
			"customTokenResponseFields",
		]);
	});

	it("leaves the grant's credential unconsumed when a hook refuses", async () => {
		server.policy.refuse = true;

		const response = await requestTokens(server, {
			grant_type: extensionGrant,
		});

		expect(oauthError(response)).toBe("invalid_grant");
		expect(server.events).toEqual([
			`extension:${extensionGrant}`,
			"beforeTokenIssuance",
		]);
	});

	it("stores no token when the grant's credential cannot be consumed", async () => {
		server.policy.failToConsume = true;
		const rowsBefore = await countTokenRows(server);

		const response = await requestTokens(server, {
			grant_type: extensionGrant,
		});

		expect(response.error).toMatchObject({
			error: "invalid_grant",
			error_description: "request already redeemed",
		});
		expect(server.events).not.toContain("customTokenResponseFields");
		expect(await countTokenRows(server)).toBe(rowsBefore);
	});

	it("stops at an extension's refusal before the top-level hook runs", async () => {
		server.policy.refuseInExtension = true;
		const rowsBefore = await countTokenRows(server);

		const response = await requestTokens(server, {
			grant_type: extensionGrant,
		});

		expect(oauthError(response)).toBe("invalid_grant");
		expect(server.events).toEqual([`extension:${extensionGrant}`]);
		expect(await countTokenRows(server)).toBe(rowsBefore);
	});
});
