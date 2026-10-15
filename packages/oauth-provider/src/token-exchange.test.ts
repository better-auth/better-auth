import type { AuthContext } from "@better-auth/core";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL, deriveDpopJkt } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";
import { resetSeedStateForTests, seedResourcesOnce } from "./resources";
import type { OAuthTokenExchangeOptions } from "./token-exchange";
import {
	ACCESS_TOKEN_TYPE,
	oauthTokenExchange,
	TOKEN_EXCHANGE_GRANT_TYPE,
} from "./token-exchange";
import type { OAuthOptions, Scope } from "./types";

const issuer = "http://localhost:3000";
const mcp = "https://mcp.example.com";
const api = "https://api.example.com";
const other = "https://other.example.com";
const redirectUri = "https://agent.example.com/callback";

type TokenResponse = {
	access_token: string;
	token_type: string;
	issued_token_type?: string;
	refresh_token?: string;
	id_token?: string;
	expires_in: number;
	scope: string;
};

async function createDpopProof() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	const proof = await new SignJWT({
		jti: generateRandomString(16),
		htm: "POST",
		htu: `${issuer}/api/auth/oauth2/token`,
		iat: Math.floor(Date.now() / 1000),
	})
		.setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
		.sign(privateKey);
	return { proof, publicJwk };
}

/**
 * An MCP host ("agent") gets a user token for the MCP server. The MCP server, a
 * confidential client serving that resource, exchanges it for a token to a
 * downstream API that still identifies the user.
 */
async function bootScenario(
	exchange: OAuthTokenExchangeOptions = {},
	{
		disableJwtPlugin = false,
		testWith,
	}: {
		disableJwtPlugin?: boolean;
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
	} = {},
	providerOptions: Partial<OAuthOptions<Scope[]>> = {},
) {
	resetSeedStateForTests();
	const opts = {
		loginPage: "/login",
		consentPage: "/consent",
		scopes: ["openid", "profile", "email", "offline_access", "read", "write"],
		// A short-lived subject token shows the exchanged token cannot outlive it.
		resources: [{ identifier: mcp, accessTokenTtl: 60 }, api, other],
		disableJwtPlugin,
		// Lets the test admin grant client_credentials scopes to a machine client.
		clientPrivileges: () => true,
		...providerOptions,
	} as OAuthOptions<Scope[]>;
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: issuer,
			plugins: [
				...(disableJwtPlugin ? [] : [jwt({ jwt: { issuer } })]),
				oauthProvider(opts),
				oauthTokenExchange(exchange),
			],
		},
		// Adapter databases are shared across instances; keep each test user unique.
		testWith
			? {
					testWith,
					testUser: { email: `${generateRandomString(12)}@test.com` },
				}
			: {},
	);
	await seedResourcesOnce(
		(await auth.$context) as unknown as AuthContext,
		opts,
	);
	const { headers } = await signInWithTestUser();

	const createClient = (body: Record<string, unknown>) =>
		auth.api.adminCreateOAuthClient({
			headers,
			body: { token_endpoint_auth_method: "client_secret_post", ...body },
		});
	const agent = await createClient({
		redirect_uris: [redirectUri],
		scope: "openid profile read write offline_access",
		skip_consent: true,
		resources: [mcp],
	});
	const exchanger = (body: Record<string, unknown> = {}) =>
		createClient({
			grant_types: [TOKEN_EXCHANGE_GRANT_TYPE],
			scope: "read write",
			skip_consent: true,
			...body,
		});
	const mcpServer = await exchanger({ resources: [mcp, api] });

	const postForm = async <T>(
		path: string,
		body: Record<string, string | string[]>,
		extraHeaders: Record<string, string> = {},
	) => {
		const form = new URLSearchParams();
		for (const [key, value] of Object.entries(body)) {
			for (const v of [value].flat()) form.append(key, v);
		}
		const result = await client.$fetch<T>(path, {
			method: "POST",
			body: form,
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...extraHeaders,
			},
		});
		// better-fetch surfaces the OAuth error envelope verbatim on `error`.
		return {
			data: result.data,
			error: result.error as {
				error?: string;
				error_description?: string;
			} | null,
		};
	};
	const postToken = (
		body: Record<string, string | string[]>,
		extraHeaders?: Record<string, string>,
	) => postForm<TokenResponse>("/oauth2/token", body, extraHeaders);

	type Requester = { client_id: string; client_secret?: string };
	const introspect = async (token: string, requester: Requester) =>
		(
			await postForm<{ active: boolean } & Record<string, unknown>>(
				"/oauth2/introspect",
				{
					token,
					client_id: requester.client_id,
					client_secret: requester.client_secret!,
				},
			)
		).data;

	/**
	 * Authorization code flow, by default for the agent with `resource=mcp`.
	 * Pass `resource: null` for a token with no audience, which is opaque.
	 */
	const userTokenForMcp = async ({
		scope = "openid read offline_access",
		requester = agent as Requester,
		resource = mcp as string | null,
		tokenHeaders = undefined as Record<string, string> | undefined,
	} = {}) => {
		const codeVerifier = generateRandomString(32);
		const url = await createAuthorizationURL({
			id: "agent",
			options: {
				clientId: requester.client_id,
				clientSecret: requester.client_secret,
				redirectURI: redirectUri,
			},
			redirectURI: "",
			authorizationEndpoint: `${issuer}/api/auth/oauth2/authorize`,
			state: "state",
			scopes: scope.split(" "),
			codeVerifier,
		});
		if (resource) url.searchParams.append("resource", resource);
		let location = "";
		await client.$fetch(url.toString(), {
			headers,
			onError(context) {
				location = context.response.headers.get("Location") ?? "";
			},
		});
		const code = new URL(location).searchParams.get("code")!;
		const { data } = await postToken(
			{
				grant_type: "authorization_code",
				code,
				code_verifier: codeVerifier,
				redirect_uri: redirectUri,
				client_id: requester.client_id,
				client_secret: requester.client_secret!,
				...(resource ? { resource } : {}),
			},
			tokenHeaders,
		);
		return data!;
	};

	const exchangeAs = (
		requester: Requester,
		subjectToken: string,
		extra: Record<string, string | string[]> = {},
		extraHeaders?: Record<string, string>,
	) =>
		postToken(
			{
				grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
				client_id: requester.client_id,
				client_secret: requester.client_secret!,
				subject_token: subjectToken,
				subject_token_type: ACCESS_TOKEN_TYPE,
				resource: api,
				...extra,
			},
			extraHeaders,
		);

	return {
		auth,
		client,
		headers,
		agent,
		mcpServer,
		exchanger,
		createClient,
		postToken,
		postForm,
		introspect,
		userTokenForMcp,
		exchangeAs,
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/8023
 */
describe("oauthTokenExchange", () => {
	it("exchanges an MCP user token for a downstream API token for the same user", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { data, error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toBeNull();
		expect(data).toMatchObject({
			issued_token_type: ACCESS_TOKEN_TYPE,
			token_type: "Bearer",
			scope: "read",
		});
		expect(data?.refresh_token).toBeUndefined();
		expect(data?.id_token).toBeUndefined();

		const before = decodeJwt(subject.access_token);
		const after = decodeJwt(data!.access_token);
		expect(after).toMatchObject({
			sub: before.sub,
			aud: api,
			client_id: mcpServer.client_id,
			sid: before.sid,
		});
		expect(after.act).toBeUndefined();
		expect(before.exp! - before.iat!).toBe(60);
		expect(after.exp).toBeLessThanOrEqual(before.exp!);
	});

	it("advertises the grant in discovery", async () => {
		const { auth } = await bootScenario();
		const metadata = await auth.api.getOAuthServerConfig();
		expect(metadata.grant_types_supported).toContain(TOKEN_EXCHANGE_GRANT_TYPE);
	});

	it("rejects a client that is neither the token's client nor in its audience", async () => {
		const { exchanger, userTokenForMcp, exchangeAs } = await bootScenario();
		const stranger = await exchanger({ resources: [api] });
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(stranger, subject.access_token);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "subject_token is invalid",
		});
	});

	it("never widens scope beyond the subject token", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(mcpServer, subject.access_token, {
			scope: "write",
		});
		expect(error?.error).toBe("invalid_scope");
	});

	it("rejects a target the client is not linked to", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(mcpServer, subject.access_token, {
			resource: other,
		});
		expect(error?.error).toBe("invalid_target");
	});

	it("requires user consent for a client that does not skip consent", async () => {
		const { exchanger, userTokenForMcp, exchangeAs } = await bootScenario();
		const untrusted = await exchanger({
			resources: [mcp, api],
			skip_consent: false,
		});
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(untrusted, subject.access_token);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: expect.stringMatching(/consented/),
		});
	});

	it("accepts a client with stored consent covering the scopes and resources", async () => {
		const { auth, exchanger, userTokenForMcp, exchangeAs } =
			await bootScenario();
		const untrusted = await exchanger({
			resources: [mcp, api],
			skip_consent: false,
		});
		const subject = await userTokenForMcp();
		const context = await auth.$context;
		const consent = await context.adapter.create({
			model: "oauthConsent",
			data: {
				clientId: untrusted.client_id,
				userId: decodeJwt(subject.access_token).sub,
				scopes: ["read"],
				resources: [mcp],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		// Consent for the MCP server alone does not cover the downstream API.
		const denied = await exchangeAs(untrusted, subject.access_token);
		expect(denied.error?.error).toBe("invalid_request");

		await context.adapter.update({
			model: "oauthConsent",
			where: [{ field: "id", value: consent.id }],
			update: { resources: [mcp, api] },
		});
		const { error } = await exchangeAs(untrusted, subject.access_token);
		expect(error).toBeNull();
	});

	it("requires the client to be registered for the grant", async () => {
		const { agent, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(agent, subject.access_token);
		expect(error?.error).toBe("unauthorized_client");
	});

	it("rejects actor tokens until delegation is supported", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(mcpServer, subject.access_token, {
			actor_token: subject.access_token,
			actor_token_type: ACCESS_TOKEN_TYPE,
		});
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "actor_token is not supported",
		});
	});

	it("applies the allowExchange policy after the built-in checks", async () => {
		const requests: Parameters<
			NonNullable<OAuthTokenExchangeOptions["allowExchange"]>
		>[0][] = [];
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario({
			allowExchange: (request) => {
				requests.push(request);
				return false;
			},
		});
		const subject = await userTokenForMcp();
		// A widened scope fails before the policy runs.
		await exchangeAs(mcpServer, subject.access_token, { scope: "write" });
		expect(requests).toHaveLength(0);

		const { error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "token exchange denied by policy",
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]).toMatchObject({
			client: { clientId: mcpServer.client_id },
			user: { id: decodeJwt(subject.access_token).sub },
			subjectToken: { active: true, aud: expect.arrayContaining([mcp]) },
			resources: [api],
			scopes: ["read"],
		});
	});

	it("never exceeds the client's registered scopes", async () => {
		const { exchanger, userTokenForMcp, exchangeAs } = await bootScenario();
		const readOnly = await exchanger({ resources: [mcp, api], scope: "read" });
		const subject = await userTokenForMcp({ scope: "openid read write" });
		const { error } = await exchangeAs(readOnly, subject.access_token, {
			scope: "read write",
		});
		expect(error).toMatchObject({
			error: "invalid_scope",
			error_description: "client does not allow scope write",
		});
	});

	it("rejects a tampered or foreign-issuer subject token as invalid", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const [header, payload, signature] = subject.access_token.split(".");
		const tampered = `${header}.${payload}.${signature!.slice(0, -2)}${
			signature!.endsWith("AA") ? "BB" : "AA"
		}`;
		const { privateKey } = await generateKeyPair("ES256");
		const foreign = await new SignJWT(decodeJwt(subject.access_token))
			.setProtectedHeader({ alg: "ES256", typ: "at+jwt", kid: "foreign" })
			.setIssuer("https://foreign.example.com")
			.sign(privateKey);
		for (const token of [tampered, foreign]) {
			const { error } = await exchangeAs(mcpServer, token);
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description: "subject_token is invalid",
			});
		}
	});

	it("refuses to issue when the subject token expires during the exchange", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario({
			// Simulates a slow policy check that outlasts the subject token.
			allowExchange: ({ subjectToken }) => {
				vi.useFakeTimers({ toFake: ["Date"] });
				vi.setSystemTime((subjectToken.exp! + 1) * 1000);
				return true;
			},
		});
		const subject = await userTokenForMcp();
		try {
			const { data, error } = await exchangeAs(mcpServer, subject.access_token);
			expect(data).toBeNull();
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description: "the token this grant derives from has expired",
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it("never calls allowExchange for an invalid target", async () => {
		let calls = 0;
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario({
			allowExchange: () => {
				calls++;
				return false;
			},
		});
		const subject = await userTokenForMcp();
		for (const resource of [other, "https://unknown.example.com"]) {
			const { error } = await exchangeAs(mcpServer, subject.access_token, {
				resource,
			});
			expect(error?.error).toBe("invalid_target");
		}
		expect(calls).toBe(0);
	});

	it("returns each requested scope once", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { data } = await exchangeAs(mcpServer, subject.access_token, {
			scope: "read read",
		});
		expect(data?.scope).toBe("read");
		expect(decodeJwt(data!.access_token).scope).toBe("read");
	});

	it("defaults to the subject scopes the client may hold", async () => {
		const { exchanger, userTokenForMcp, exchangeAs } = await bootScenario();
		const readOnly = await exchanger({ resources: [mcp, api], scope: "read" });
		const subject = await userTokenForMcp({ scope: "openid read write" });
		const { data, error } = await exchangeAs(readOnly, subject.access_token);
		expect(error).toBeNull();
		expect(data?.scope).toBe("read");
	});

	it("counts only consent stored without a reference for a subject without one", async () => {
		const { auth, exchanger, userTokenForMcp, exchangeAs } =
			await bootScenario();
		const untrusted = await exchanger({
			resources: [mcp, api],
			skip_consent: false,
		});
		const subject = await userTokenForMcp();
		await (await auth.$context).adapter.create({
			model: "oauthConsent",
			data: {
				clientId: untrusted.client_id,
				userId: decodeJwt(subject.access_token).sub,
				referenceId: "org_1",
				scopes: ["read"],
				resources: [mcp, api],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const { error } = await exchangeAs(untrusted, subject.access_token);
		expect(error?.error_description).toMatch(/consented/);
	});

	it("treats a blank scope as absent", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { data } = await exchangeAs(mcpServer, subject.access_token, {
			scope: " ",
		});
		expect(data?.scope).toBe("read");
	});

	it("issues one token for several resources", async () => {
		const { exchanger, userTokenForMcp, exchangeAs } = await bootScenario();
		const fanout = await exchanger({ resources: [mcp, api, other] });
		const subject = await userTokenForMcp();
		const { data, error } = await exchangeAs(fanout, subject.access_token, {
			resource: [api, other],
		});
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).aud).toEqual([api, other]);
	});

	it("accepts audience values that name registered resources", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs, postToken } =
			await bootScenario();
		const subject = await userTokenForMcp();
		const { data, error } = await postToken({
			grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
			client_id: mcpServer.client_id,
			client_secret: mcpServer.client_secret!,
			subject_token: subject.access_token,
			subject_token_type: ACCESS_TOKEN_TYPE,
			audience: api,
		});
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).aud).toBe(api);

		const unknown = await exchangeAs(mcpServer, subject.access_token, {
			audience: "https://unknown.example.com",
		});
		expect(unknown.error?.error).toBe("invalid_target");
	});

	it("ends the exchanged token with the user's session", async () => {
		const {
			auth,
			headers,
			mcpServer,
			introspect,
			userTokenForMcp,
			exchangeAs,
		} = await bootScenario();
		const subject = await userTokenForMcp();
		const { data } = await exchangeAs(mcpServer, subject.access_token);
		await auth.api.signOut({ headers });

		expect((await introspect(data!.access_token, mcpServer))?.active).toBe(
			false,
		);
		const { error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error?.error).toBe("invalid_request");
	});

	it("exchanges the client's own opaque access token", async () => {
		const { createClient, introspect, userTokenForMcp, exchangeAs } =
			await bootScenario();
		// A BFF that signs the user in, then exchanges its own token for an API.
		const bff = await createClient({
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read write",
			skip_consent: true,
			resources: [api],
		});
		const subject = await userTokenForMcp({
			scope: "openid read",
			requester: bff,
			resource: null,
		});
		// No audience, so the subject token is opaque rather than a JWT.
		expect(subject.access_token.split(".")).toHaveLength(1);

		const { data, error } = await exchangeAs(bff, subject.access_token);
		expect(error).toBeNull();
		expect(data).toMatchObject({ issued_token_type: ACCESS_TOKEN_TYPE });
		const introspection = await introspect(data!.access_token, bff);
		expect(introspection).toMatchObject({
			active: true,
			client_id: bff.client_id,
			aud: api,
			scope: "read",
		});
	});

	it("rejects a revoked subject token", async () => {
		const { createClient, postForm, userTokenForMcp, exchangeAs } =
			await bootScenario();
		const bff = await createClient({
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read",
			skip_consent: true,
			resources: [api],
		});
		const subject = await userTokenForMcp({
			scope: "openid read",
			requester: bff,
			resource: null,
		});
		const revoked = await postForm("/oauth2/revoke", {
			token: subject.access_token,
			token_type_hint: "access_token",
			client_id: bff.client_id,
			client_secret: bff.client_secret!,
		});
		expect(revoked.error).toBeNull();
		const { error } = await exchangeAs(bff, subject.access_token);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "subject_token is invalid",
		});
	});

	it("rejects a machine subject token from client credentials", async () => {
		const { createClient, mcpServer, postToken, exchangeAs } =
			await bootScenario();
		const machine = await createClient({
			grant_types: ["client_credentials"],
			scope: "read",
			client_credentials_scopes: ["read"],
			resources: [mcp],
		});
		const { data: subject } = await postToken({
			grant_type: "client_credentials",
			client_id: machine.client_id,
			client_secret: machine.client_secret!,
			scope: "read",
			resource: mcp,
		});
		expect(subject?.access_token).toBeDefined();
		const { error } = await exchangeAs(mcpServer, subject!.access_token);
		expect(error?.error).toBe("invalid_request");
		expect(error?.error_description).toBe(
			"subject_token does not represent a user",
		);
	});

	it("binds the exchanged token to a DPoP proof on the request", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { proof, publicJwk } = await createDpopProof();
		const { data, error } = await exchangeAs(
			mcpServer,
			subject.access_token,
			{},
			{ DPoP: proof },
		);
		expect(error).toBeNull();
		expect(data?.token_type).toBe("DPoP");
		expect(decodeJwt(data!.access_token).cnf).toEqual({
			jkt: await deriveDpopJkt(publicJwk),
		});
	});

	// RFC 9449 does not say how a sender-constrained subject token constrains an
	// exchange by another party; the caller already proved it may hold the token.
	it("exchanges a DPoP-bound subject token presented by a resource server", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const { proof } = await createDpopProof();
		const subject = await userTokenForMcp({ tokenHeaders: { DPoP: proof } });
		expect(subject.token_type).toBe("DPoP");
		const { data, error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toBeNull();
		expect(data?.token_type).toBe("Bearer");
		expect(decodeJwt(data!.access_token).cnf).toBeUndefined();
	});

	it.each([
		[
			"requested_token_type other than access_token",
			{ requested_token_type: "urn:ietf:params:oauth:token-type:jwt" },
			/requested_token_type/,
		],
		// RFC 8693 §2.1: actor_token_type MUST NOT be sent without actor_token.
		[
			"actor_token_type without actor_token",
			{ actor_token_type: ACCESS_TOKEN_TYPE },
			/actor_token/,
		],
		[
			"an unsupported subject_token_type",
			{ subject_token_type: "urn:ietf:params:oauth:token-type:id_token" },
			/subject_token_type/,
		],
	])("rejects %s with invalid_request", async (_, extra, description) => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(mcpServer, subject.access_token, extra);
		expect(error?.error).toBe("invalid_request");
		expect(error?.error_description).toMatch(description);
	});

	it("requires a resource", async () => {
		const { mcpServer, userTokenForMcp, postToken } = await bootScenario();
		const subject = await userTokenForMcp();
		const { error } = await postToken({
			grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
			client_id: mcpServer.client_id,
			client_secret: mcpServer.client_secret!,
			subject_token: subject.access_token,
			subject_token_type: ACCESS_TOKEN_TYPE,
		});
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "resource or audience is required",
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8023
 */
describe("oauthTokenExchange without the JWT plugin", () => {
	it("exchanges opaque tokens and issues an opaque token", async () => {
		const { agent, mcpServer, introspect, userTokenForMcp, exchangeAs } =
			await bootScenario({}, { disableJwtPlugin: true });
		const subject = await userTokenForMcp();
		expect(subject.access_token.split(".")).toHaveLength(1);

		const { data, error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toBeNull();
		expect(data).toMatchObject({
			issued_token_type: ACCESS_TOKEN_TYPE,
			token_type: "Bearer",
			scope: "read",
		});
		expect(data!.access_token.split(".")).toHaveLength(1);

		const [before, after] = await Promise.all([
			introspect(subject.access_token, agent),
			introspect(data!.access_token, mcpServer),
		]);
		expect(after).toMatchObject({
			active: true,
			sub: before?.sub,
			client_id: mcpServer.client_id,
			aud: api,
		});
		expect(after?.exp as number).toBeLessThanOrEqual(before?.exp as number);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8023
 */
describe("OAuthTokenIssueParams.maxExpiresAt", () => {
	it("caps the expiry of an extension grant's access token", async () => {
		const cappedGrant = "urn:better-auth:test:capped-grant";
		let cap: Date | undefined;
		const cappedPlugin = {
			id: "test-capped-grant",
			init(ctx) {
				extendOAuthProvider(ctx, {
					grants: {
						[cappedGrant]: async ({ provider }) => {
							const { client } = await provider.authenticateClient({
								scopes: ["read"],
							});
							return provider.issueTokens({
								client,
								scopes: ["read"],
								maxExpiresAt: cap,
							});
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		const { auth, client, signInWithTestUser } = await getTestInstance({
			baseURL: issuer,
			plugins: [
				jwt({ jwt: { issuer } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					scopes: ["read"],
					m2mAccessTokenExpiresIn: 3600,
				}),
				cappedPlugin,
			],
		});
		const { headers } = await signInWithTestUser();
		const registered = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: [cappedGrant],
				scope: "read",
			},
		});
		const issue = async () =>
			(
				await client.$fetch<TokenResponse>("/oauth2/token", {
					method: "POST",
					body: new URLSearchParams({
						grant_type: cappedGrant,
						client_id: registered.client_id,
						client_secret: registered.client_secret!,
					}),
					headers: { "content-type": "application/x-www-form-urlencoded" },
				})
			).data!;

		expect((await issue()).expires_in).toBeGreaterThan(3500);
		cap = new Date(Date.now() + 30_000);
		const capped = await issue();
		expect(capped.expires_in).toBeGreaterThan(0);
		expect(capped.expires_in).toBeLessThanOrEqual(30);
		// A cap later than the configured lifetime does not extend it.
		cap = new Date(Date.now() + 7200_000);
		expect((await issue()).expires_in).toBeLessThanOrEqual(3600);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/8023
 */
describe("oauthTokenExchange consent reference", () => {
	const orgClaim = "https://example.com/org";
	/** The organization `consentReferenceId` picks, like an active organization. */
	let activeOrganization = "org_1";
	const providerOptions = {
		postLogin: {
			page: "/select-organization",
			shouldRedirect: () => false,
			consentReferenceId: () => activeOrganization,
		},
		customAccessTokenClaims: ({ referenceId }) =>
			referenceId ? { [orgClaim]: referenceId } : {},
	} satisfies Partial<OAuthOptions<Scope[]>>;
	const boot = (exchange: OAuthTokenExchangeOptions = {}) => {
		activeOrganization = "org_1";
		return bootScenario(exchange, {}, providerOptions);
	};

	it("keeps the subject token's reference, even after the user switches", async () => {
		const references: (string | undefined)[] = [];
		const { mcpServer, userTokenForMcp, exchangeAs } = await boot({
			allowExchange: ({ referenceId }) => {
				references.push(referenceId);
				return true;
			},
		});
		const subject = await userTokenForMcp();
		expect(decodeJwt(subject.access_token)).toMatchObject({
			reference_id: "org_1",
			[orgClaim]: "org_1",
		});
		activeOrganization = "org_2";

		const { data, error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token)).toMatchObject({
			reference_id: "org_1",
			[orgClaim]: "org_1",
		});
		expect(references).toEqual(["org_1"]);
	});

	it("keeps the reference of an opaque subject token", async () => {
		const { createClient, introspect, userTokenForMcp, exchangeAs } =
			await boot();
		const bff = await createClient({
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read",
			skip_consent: true,
			resources: [api],
		});
		const subject = await userTokenForMcp({
			scope: "openid read",
			requester: bff,
			resource: null,
		});
		expect((await introspect(subject.access_token, bff))?.reference_id).toBe(
			"org_1",
		);
		const { data } = await exchangeAs(bff, subject.access_token);
		expect(decodeJwt(data!.access_token)[orgClaim]).toBe("org_1");
	});

	it("checks consent under the subject token's reference", async () => {
		const { auth, exchanger, userTokenForMcp, exchangeAs } = await boot();
		const untrusted = await exchanger({
			resources: [mcp, api],
			skip_consent: false,
		});
		const subject = await userTokenForMcp();
		const context = await auth.$context;
		const consent = await context.adapter.create({
			model: "oauthConsent",
			data: {
				clientId: untrusted.client_id,
				userId: decodeJwt(subject.access_token).sub,
				referenceId: "org_2",
				scopes: ["read"],
				resources: [mcp, api],
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		// Consent the user gave under another organization does not count.
		const denied = await exchangeAs(untrusted, subject.access_token);
		expect(denied.error?.error_description).toMatch(/consented/);

		await context.adapter.update({
			model: "oauthConsent",
			where: [{ field: "id", value: consent.id }],
			update: { referenceId: "org_1" },
		});
		const { error } = await exchangeAs(untrusted, subject.access_token);
		expect(error).toBeNull();
	});

	it("keeps reference_id owned by the authorization server", async () => {
		const { userTokenForMcp } = await bootScenario(
			{},
			{},
			{
				...providerOptions,
				customAccessTokenClaims: () => ({ reference_id: "forged" }),
			},
		);
		activeOrganization = "org_1";
		const subject = await userTokenForMcp();
		expect(decodeJwt(subject.access_token).reference_id).toBe("org_1");
	});
});

/**
 * The consent lookup (including its `referenceId IS NULL` match), the consent
 * array columns, `reference_id` on JWT and opaque tokens, and opaque-token
 * revocation all go through the database adapter.
 *
 * @see https://github.com/better-auth/better-auth/issues/8023
 */
describe.each(["postgres", "mongodb"] as const)(
	"oauthTokenExchange on %s",
	(testWith) => {
		const orgClaim = "https://example.com/org";
		const withReference = {
			postLogin: {
				page: "/select-organization",
				shouldRedirect: () => false,
				consentReferenceId: () => "org_1",
			},
			customAccessTokenClaims: ({ referenceId }) =>
				referenceId ? { [orgClaim]: referenceId } : {},
		} satisfies Partial<OAuthOptions<Scope[]>>;

		const createConsent = async (
			auth: Awaited<ReturnType<typeof bootScenario>>["auth"],
			data: Record<string, unknown>,
		) =>
			(await auth.$context).adapter.create({
				model: "oauthConsent",
				data: {
					scopes: ["read"],
					resources: [mcp, api],
					createdAt: new Date(),
					updatedAt: new Date(),
					...data,
				},
			});

		it("keeps the reference and checks consent under it", async () => {
			const { auth, exchanger, userTokenForMcp, exchangeAs } =
				await bootScenario({}, { testWith }, withReference);
			const untrusted = await exchanger({
				resources: [mcp, api],
				skip_consent: false,
			});
			const subject = await userTokenForMcp();
			const userId = decodeJwt(subject.access_token).sub;
			await createConsent(auth, {
				clientId: untrusted.client_id,
				userId,
				referenceId: "org_2",
			});
			const denied = await exchangeAs(untrusted, subject.access_token);
			expect(denied.error?.error_description).toMatch(/consented/);

			await createConsent(auth, {
				clientId: untrusted.client_id,
				userId,
				referenceId: "org_1",
			});
			const { data, error } = await exchangeAs(untrusted, subject.access_token);
			expect(error).toBeNull();
			expect(decodeJwt(data!.access_token)).toMatchObject({
				reference_id: "org_1",
				[orgClaim]: "org_1",
			});
		});

		it("matches only consent stored without a reference for a subject without one", async () => {
			const { auth, exchanger, userTokenForMcp, exchangeAs } =
				await bootScenario({}, { testWith });
			const untrusted = await exchanger({
				resources: [mcp, api],
				skip_consent: false,
			});
			const subject = await userTokenForMcp();
			const userId = decodeJwt(subject.access_token).sub;
			await createConsent(auth, {
				clientId: untrusted.client_id,
				userId,
				referenceId: "org_1",
			});
			const denied = await exchangeAs(untrusted, subject.access_token);
			expect(denied.error?.error_description).toMatch(/consented/);

			await createConsent(auth, { clientId: untrusted.client_id, userId });
			const { error } = await exchangeAs(untrusted, subject.access_token);
			expect(error).toBeNull();
		});

		it("exchanges an opaque subject token and rejects it once revoked", async () => {
			const {
				createClient,
				introspect,
				postForm,
				userTokenForMcp,
				exchangeAs,
			} = await bootScenario({}, { testWith }, withReference);
			const bff = await createClient({
				grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
				redirect_uris: [redirectUri],
				scope: "openid read",
				skip_consent: true,
				resources: [api],
			});
			const subject = await userTokenForMcp({
				scope: "openid read",
				requester: bff,
				resource: null,
			});
			expect((await introspect(subject.access_token, bff))?.reference_id).toBe(
				"org_1",
			);
			const { data, error } = await exchangeAs(bff, subject.access_token);
			expect(error).toBeNull();
			expect(decodeJwt(data!.access_token).reference_id).toBe("org_1");

			await postForm("/oauth2/revoke", {
				token: subject.access_token,
				token_type_hint: "access_token",
				client_id: bff.client_id,
				client_secret: bff.client_secret!,
			});
			const revoked = await exchangeAs(bff, subject.access_token);
			expect(revoked.error?.error_description).toBe("subject_token is invalid");
		});
	},
);
