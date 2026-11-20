import { generateRandomString } from "better-auth/crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
} from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { APIError } from "better-call";
import { beforeEach, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import { RESERVED_TOKEN_RESPONSE_FIELDS } from "./token-response-fields";
import type { OAuthBeforeTokenIssuanceInput } from "./types";

const authServerBaseUrl = "http://localhost:3000";
const redirectUri = "http://localhost:5000/api/auth/oauth2/callback/test";

/** Every reserved name with a value no provider would issue. */
const forgedFields = {
	access_token: "forged",
	token_type: "forged",
	scope: "forged",
	refresh_token: "forged",
	id_token: "forged",
	expires_in: 1,
	expires_at: 1,
	issued_token_type: "forged",
	authorization_details: [{ type: "forged" }],
};

async function createServer(
	providerOptions: Partial<Parameters<typeof oauthProvider>[0]>,
) {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["openid", "profile", "offline_access", "read"],
					clientPrivileges: () => true,
					...providerOptions,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();
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
			],
			scope: "openid profile offline_access read",
			client_credentials_scopes: ["read"],
			skip_consent: true,
		},
	});
	const options = {
		clientId: oauthClient.client_id,
		clientSecret: oauthClient.client_secret!,
		redirectURI: redirectUri,
	};
	return { client, headers, options };
}

async function setup() {
	const inputs: OAuthBeforeTokenIssuanceInput[] = [];
	const policy = { refuse: false };
	const server = await createServer({
		beforeTokenIssuance: () => {
			if (policy.refuse) {
				throw new APIError("BAD_REQUEST", { error: "invalid_grant" });
			}
		},
		customTokenResponseFields: () => ({ shared: "option" }),
		extensions: [
			{
				name: "first",
				tokenResponseFields: (input: OAuthBeforeTokenIssuanceInput) => {
					inputs.push(input);
					return {
						...forgedFields,
						auth_session: `session-for-${input.grantId}`,
						shared: "first",
						contested: "first",
						skipped: undefined,
					};
				},
			},
			{
				name: "second",
				tokenResponseFields: () => ({
					contested: "second",
					second_only: "second",
				}),
			},
		],
	});
	return { ...server, inputs, policy };
}

type TestServer = Awaited<ReturnType<typeof createServer>>;

async function redeemNewCode({ client, headers, options }: TestServer) {
	const codeVerifier = generateRandomString(32);
	const authUrl = await createAuthorizationURL({
		id: "test",
		options,
		redirectURI: "",
		authorizationEndpoint: `${authServerBaseUrl}/api/auth/oauth2/authorize`,
		state: "123",
		scopes: ["openid", "profile", "offline_access"],
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
	const { body, headers: tokenHeaders } = await authorizationCodeRequest({
		code,
		codeVerifier,
		redirectURI: redirectUri,
		options,
	});
	return client.$fetch<Record<string, unknown>>("/oauth2/token", {
		method: "POST",
		body,
		headers: tokenHeaders,
	});
}

it("reserves the nine names the provider owns", () => {
	expect([...RESERVED_TOKEN_RESPONSE_FIELDS].sort()).toEqual(
		Object.keys(forgedFields).sort(),
	);
});

describe("oauth-provider - extension token response fields", async () => {
	const server = await setup();

	beforeEach(() => {
		server.inputs.length = 0;
		server.policy.refuse = false;
	});

	it("adds an extension's fields to the token response with the issuance's context", async () => {
		const response = await redeemNewCode(server);

		expect(response.error).toBeNull();
		const [input] = server.inputs;
		expect(input).toMatchObject({
			grantType: "authorization_code",
			client: { clientId: server.options.clientId },
			grantId: expect.any(String),
			verificationValue: { type: "authorization_code" },
		});
		expect(response.data).toMatchObject({
			auth_session: `session-for-${input!.grantId}`,
			second_only: "second",
		});
		expect(response.data).not.toHaveProperty("skipped");
	});

	it("keeps the provider's standard fields and leaves out reserved names", async () => {
		const response = await redeemNewCode(server);
		const body = response.data!;

		expect(body.access_token).not.toBe("forged");
		expect(body.refresh_token).not.toBe("forged");
		expect(body.id_token).not.toBe("forged");
		expect(body.token_type).toBe("Bearer");
		expect(body.scope).toBe("openid profile offline_access");
		expect(body.expires_in).toBeGreaterThan(1);
		expect(body).not.toHaveProperty("issued_token_type");
		expect(body).not.toHaveProperty("authorization_details");
	});

	it("lets the first extension and then the option win a field contributed twice", async () => {
		const response = await redeemNewCode(server);

		expect(response.data).toMatchObject({
			contested: "first",
			shared: "option",
		});
	});

	it("does not run when beforeTokenIssuance refuses the issuance", async () => {
		server.policy.refuse = true;

		const response = await redeemNewCode(server);

		expect(response.error?.status).toBe(400);
		expect(server.inputs).toHaveLength(0);
	});
});

describe("oauth-provider - customTokenResponseFields reserved names", async () => {
	const server = await createServer({
		customTokenResponseFields: () => ({ ...forgedFields, custom: "kept" }),
	});

	it("leaves the standard fields of a user token as the provider issued them", async () => {
		const response = await redeemNewCode(server);

		expect(response.error).toBeNull();
		const body = response.data!;
		expect(body).toMatchObject({
			custom: "kept",
			token_type: "Bearer",
			scope: "openid profile offline_access",
		});
		expect(body.access_token).not.toBe("forged");
		expect(body.refresh_token).not.toBe("forged");
		expect(body.id_token).not.toBe("forged");
		expect(body.expires_in).toBeGreaterThan(1);
		expect(body.expires_at).toBeGreaterThan(1);
	});

	it("drops a forged refresh_token and id_token when the provider issues none", async () => {
		const response = await server.client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: server.options.clientId,
					client_secret: server.options.clientSecret,
					scope: "read",
				}),
			},
		);

		expect(response.error).toBeNull();
		const body = response.data!;
		expect(body).toMatchObject({ custom: "kept", scope: "read" });
		expect(body.access_token).not.toBe("forged");
		expect(body).not.toHaveProperty("refresh_token");
		expect(body).not.toHaveProperty("id_token");
	});
});
