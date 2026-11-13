import type { AuthContext } from "@better-auth/core";
import { generateRandomString } from "better-auth/crypto";
import { createAuthorizationURL, deriveDpopJkt } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth/types";
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
import type {
	Confirmation,
	OAuthOptions,
	OAuthTokenIssueParams,
	Scope,
} from "./types";

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

/** A DPoP key that signs a fresh token-endpoint proof on each `prove()`. */
async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	const prove = () =>
		new SignJWT({
			jti: generateRandomString(16),
			htm: "POST",
			htu: `${issuer}/api/auth/oauth2/token`,
			iat: Math.floor(Date.now() / 1000),
		})
			.setProtectedHeader({ typ: "dpop+jwt", alg: "ES256", jwk: publicJwk })
			.sign(privateKey);
	return { publicJwk, prove };
}

async function createDpopProof() {
	const { publicJwk, prove } = await createDpopKey();
	return { proof: await prove(), publicJwk };
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
		plugins = [],
		advanced,
	}: {
		disableJwtPlugin?: boolean;
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
		plugins?: BetterAuthPlugin[];
		advanced?: BetterAuthOptions["advanced"];
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
			advanced,
			plugins: [
				...(disableJwtPlugin ? [] : [jwt({ jwt: { issuer } })]),
				oauthProvider(opts),
				oauthTokenExchange(exchange),
				...plugins,
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
		clientAuth = undefined as Record<string, string> | undefined,
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
				...(clientAuth ?? { client_secret: requester.client_secret! }),
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
				...(requester.client_secret
					? { client_secret: requester.client_secret }
					: {}),
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

	it("reports a key set failure as a server error, not an invalid subject", async () => {
		const { auth, mcpServer, userTokenForMcp, exchangeAs } =
			await bootScenario();
		const subject = await userTokenForMcp();
		const jwtPlugin = (await auth.$context).getPlugin("jwt")!;
		vi.spyOn(jwtPlugin.endpoints, "getJwks").mockResolvedValue({
			response: { keys: "malformed" },
		} as never);
		const { error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toMatchObject({ status: 500 });
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
		const createConsent = async (referenceId: string) =>
			(await auth.$context).adapter.create({
				model: "oauthConsent",
				data: {
					clientId: untrusted.client_id,
					userId: decodeJwt(subject.access_token).sub,
					referenceId,
					scopes: ["read"],
					resources: [mcp, api],
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		await createConsent("org_1");
		const denied = await exchangeAs(untrusted, subject.access_token);
		expect(denied.error?.error_description).toMatch(/consented/);

		// An empty reference is no reference too.
		await createConsent("");
		const { error } = await exchangeAs(untrusted, subject.access_token);
		expect(error).toBeNull();
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

	it("binds a resource server's exchange of a DPoP-bound token to the resource server's key", async () => {
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootScenario();
		const { proof: clientProof } = await createDpopProof();
		const subject = await userTokenForMcp({
			tokenHeaders: { DPoP: clientProof },
		});
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

	describe.each([
		["JWT", mcp],
		["opaque", null],
	])(
		"a client exchanging its own DPoP-bound %s access token",
		(_format, resource) => {
			async function exchangeOwnBoundToken() {
				const allowExchange = vi.fn(() => true);
				const scenario = await bootScenario({ allowExchange });
				const bff = await scenario.createClient({
					grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
					redirect_uris: [redirectUri],
					scope: "openid read write",
					skip_consent: true,
					resources: [mcp, api],
				});
				const key = await createDpopKey();
				const subject = await scenario.userTokenForMcp({
					scope: "openid read",
					requester: bff,
					resource,
					tokenHeaders: { DPoP: await key.prove() },
				});
				expect(subject.token_type).toBe("DPoP");
				return {
					introspect: scenario.introspect,
					allowExchange,
					key,
					bff,
					exchange: (dpopHeaders?: Record<string, string>) =>
						scenario.exchangeAs(bff, subject.access_token, {}, dpopHeaders),
				};
			}

			it("requires a DPoP proof before allowExchange runs", async () => {
				const { exchange, allowExchange } = await exchangeOwnBoundToken();
				const { error } = await exchange();
				expect(error).toMatchObject({
					error: "invalid_dpop_proof",
					error_description: "DPoP proof header is required",
				});
				expect(allowExchange).not.toHaveBeenCalled();
			});

			it("rejects a reused proof", async () => {
				const { exchange, key } = await exchangeOwnBoundToken();
				const proof = await key.prove();
				expect((await exchange({ DPoP: proof })).error).toBeNull();
				expect((await exchange({ DPoP: proof })).error).toMatchObject({
					error: "invalid_dpop_proof",
					error_description: "DPoP proof jti has already been used",
				});
			});

			it("requires the proof to use the subject token's key", async () => {
				const { exchange } = await exchangeOwnBoundToken();
				const { proof } = await createDpopProof();
				const { error } = await exchange({ DPoP: proof });
				expect(error).toMatchObject({
					error: "invalid_dpop_proof",
					error_description: "DPoP proof key does not match the bound token",
				});
			});

			it("binds the exchanged token to the subject token's key", async () => {
				const { exchange, key, bff, introspect } =
					await exchangeOwnBoundToken();
				const { data, error } = await exchange({ DPoP: await key.prove() });
				expect(error).toBeNull();
				expect(data?.token_type).toBe("DPoP");
				expect(await introspect(data!.access_token, bff)).toMatchObject({
					active: true,
					aud: api,
					cnf: { jkt: await deriveDpopJkt(key.publicJwk) },
				});
			});
		},
	);

	it("lets allowExchange accept a sender-constrained subject token only from its own client", async () => {
		const { createClient, mcpServer, userTokenForMcp, exchangeAs } =
			await bootScenario({
				allowExchange: ({ client, subjectToken }) =>
					!subjectToken.cnf || subjectToken.client_id === client.clientId,
			});
		const agentKey = await createDpopKey();
		const forMcp = await userTokenForMcp({
			tokenHeaders: { DPoP: await agentKey.prove() },
		});
		expect(
			(await exchangeAs(mcpServer, forMcp.access_token)).error,
		).toMatchObject({
			error: "invalid_request",
			error_description: "token exchange denied by policy",
		});

		const bearer = await userTokenForMcp();
		expect((await exchangeAs(mcpServer, bearer.access_token)).error).toBeNull();

		const bff = await createClient({
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read write",
			skip_consent: true,
			resources: [mcp, api],
		});
		const bffKey = await createDpopKey();
		const own = await userTokenForMcp({
			scope: "openid read",
			requester: bff,
			tokenHeaders: { DPoP: await bffKey.prove() },
		});
		const { error } = await exchangeAs(
			bff,
			own.access_token,
			{},
			{ DPoP: await bffKey.prove() },
		);
		expect(error).toBeNull();
	});

	/**
	 * Boots a wallet client whose `clientAuthentication` strategy returns
	 * whatever `confirmation` the test sets, and exchanges as that wallet.
	 */
	async function bootConfirmingWallet(
		scenario: { disableJwtPlugin?: boolean } = {},
	) {
		const authMethod = "test_confirming_auth";
		const assertionType =
			"urn:better-auth:test:client-assertion-type:test-confirming";
		const state: { confirmation?: Confirmation } = {};
		const confirming = {
			id: "test-confirming",
			init(ctx) {
				extendOAuthProvider(ctx, {
					clientAuthentication: {
						[authMethod]: {
							assertionTypes: [assertionType],
							authenticate: async ({ clientId }) => ({
								clientId: clientId!,
								confirmation: state.confirmation,
							}),
						},
					},
				});
			},
		} satisfies BetterAuthPlugin;
		const allowExchange = vi.fn(() => true);
		const { createClient, userTokenForMcp, postToken } = await bootScenario(
			{ allowExchange },
			{ plugins: [confirming], ...scenario },
		);
		const wallet = await createClient({
			token_endpoint_auth_method: authMethod,
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read write",
			skip_consent: true,
			resources: [mcp, api],
		});
		const clientAuth = {
			client_assertion_type: assertionType,
			client_assertion: `assertion:${wallet.client_id}`,
		};
		const userToken = (tokenHeaders?: Record<string, string>) =>
			userTokenForMcp({
				scope: "openid read",
				requester: wallet,
				clientAuth,
				tokenHeaders,
			});
		const exchange = (
			subjectToken: string,
			extraHeaders?: Record<string, string>,
		) =>
			postToken(
				{
					grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
					client_id: wallet.client_id,
					...clientAuth,
					subject_token: subjectToken,
					subject_token_type: ACCESS_TOKEN_TYPE,
					resource: api,
				},
				extraHeaders,
			);
		return { state, allowExchange, userToken, exchange };
	}

	describe("a client whose authentication strategy proves a confirmation", () => {
		async function exchangeWithProvenConfirmation(
			proven: (subjectJkt: string) => Confirmation,
		) {
			const { state, allowExchange, userToken, exchange } =
				await bootConfirmingWallet();
			const key = await createDpopKey();
			const subject = await userToken({ DPoP: await key.prove() });
			const subjectJkt = await deriveDpopJkt(key.publicJwk);
			expect(decodeJwt(subject.access_token).cnf).toEqual({ jkt: subjectJkt });

			state.confirmation = proven(subjectJkt);
			const result = await exchange(subject.access_token);
			return { ...result, allowExchange, subjectJkt };
		}

		it("keeps a confirmation with the subject token's key", async () => {
			const { data, error, subjectJkt } = await exchangeWithProvenConfirmation(
				(jkt) => ({ jkt }),
			);
			expect(error).toBeNull();
			expect(data?.token_type).toBe("DPoP");
			expect(decodeJwt(data!.access_token).cnf).toEqual({ jkt: subjectJkt });
		});

		it.each([
			["a different DPoP key", () => ({ jkt: "another-key" })],
			["a certificate binding", () => ({ "x5t#S256": "attested-certificate" })],
		] satisfies [string, () => Confirmation][])(
			"rejects %s before allowExchange runs",
			async (_label, proven) => {
				const { error, allowExchange } =
					await exchangeWithProvenConfirmation(proven);
				expect(error).toMatchObject({
					error: "invalid_dpop_proof",
					error_description:
						"Client authentication confirmation does not match the bound token",
				});
				expect(allowExchange).not.toHaveBeenCalled();
			},
		);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8705#section-3
	 * @see https://datatracker.ietf.org/doc/html/rfc8693#section-2.2.2
	 */
	describe("a client exchanging its own certificate-bound subject token", () => {
		const certificate = { "x5t#S256": "subject-certificate" };

		async function exchangeCertificateBoundSubject(
			presented: Confirmation | undefined,
			extraHeaders?: Record<string, string>,
			scenario: { disableJwtPlugin?: boolean } = {},
		) {
			const { state, allowExchange, userToken, exchange } =
				await bootConfirmingWallet(scenario);
			// Built-in grants bind only DPoP, so the certificate-bound subject comes
			// from an exchange that presented the certificate.
			state.confirmation = certificate;
			const { data: subject } = await exchange(
				(await userToken()).access_token,
			);
			if (!scenario.disableJwtPlugin) {
				expect(decodeJwt(subject!.access_token).cnf).toEqual(certificate);
			}

			state.confirmation = presented;
			allowExchange.mockClear();
			const result = await exchange(subject!.access_token, extraHeaders);
			return { ...result, allowExchange };
		}

		const mismatch = {
			error: "invalid_request",
			error_description:
				"client authentication does not match the subject_token binding",
		};

		it("keeps the binding when the client presents the same certificate", async () => {
			const { data, error } = await exchangeCertificateBoundSubject({
				...certificate,
			});
			expect(error).toBeNull();
			expect(data?.token_type).toBe("Bearer");
			expect(decodeJwt(data!.access_token).cnf).toEqual(certificate);
		});

		it.each([
			["a different certificate", { "x5t#S256": "another-certificate" }],
			["no certificate", undefined],
		] satisfies [string, Confirmation | undefined][])(
			"rejects %s before allowExchange runs",
			async (_label, presented) => {
				const { error, allowExchange } =
					await exchangeCertificateBoundSubject(presented);
				expect(error).toMatchObject(mismatch);
				expect(allowExchange).not.toHaveBeenCalled();
			},
		);

		it("checks the stored binding of an opaque subject token", async () => {
			const opaque = { disableJwtPlugin: true };
			const same = await exchangeCertificateBoundSubject(
				{ ...certificate },
				undefined,
				opaque,
			);
			expect(same.error).toBeNull();
			const other = await exchangeCertificateBoundSubject(
				{ "x5t#S256": "another-certificate" },
				undefined,
				opaque,
			);
			expect(other.error).toMatchObject(mismatch);
			expect(other.allowExchange).not.toHaveBeenCalled();
		});

		it("rejects a DPoP proof in place of the certificate", async () => {
			const key = await createDpopKey();
			const { error, allowExchange } = await exchangeCertificateBoundSubject(
				undefined,
				{ DPoP: await key.prove() },
			);
			expect(error).toMatchObject(mismatch);
			expect(allowExchange).not.toHaveBeenCalled();
		});
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

	it("rejects a target that is not a registered resource", async () => {
		const { auth, mcpServer, userTokenForMcp, exchangeAs } =
			await bootScenario();
		const subject = await userTokenForMcp();
		const userinfo = `${issuer}/api/auth/oauth2/userinfo`;
		const viaUserinfo = await exchangeAs(mcpServer, subject.access_token, {
			audience: userinfo,
		});
		expect(viaUserinfo.error?.error).toBe("invalid_target");
		// Like any other target, it is checked only after client authentication.
		const unauthenticated = await exchangeAs(
			{ ...mcpServer, client_secret: "wrong" },
			subject.access_token,
			{ audience: userinfo },
		);
		expect(unauthenticated.error?.error).toBe("invalid_client");

		// Unlike a form body, a server call can pass any value.
		const exchange = (audience: unknown) =>
			auth.api.oauth2Token({
				body: {
					grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
					client_id: mcpServer.client_id,
					client_secret: mcpServer.client_secret!,
					subject_token: subject.access_token,
					subject_token_type: ACCESS_TOKEN_TYPE,
					audience,
				},
			});
		for (const audience of ["", [""], [{}]]) {
			await expect(exchange(audience)).rejects.toMatchObject({
				body: { error: "invalid_target" },
			});
		}
		await expect(exchange(null)).rejects.toMatchObject({
			body: { error_description: "resource or audience is required" },
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
	it("never issues or rotates a refresh token with act", async () => {
		const delegatingGrant = "urn:better-auth:test:delegating-grant";
		// A parent refresh token the grant asks to rotate, when set.
		let parent: OAuthTokenIssueParams["refreshToken"];
		const delegatingPlugin = {
			id: "test-delegating-grant",
			init(ctx) {
				extendOAuthProvider(ctx, {
					grants: {
						[delegatingGrant]: async ({ ctx, provider }) => {
							const { client } = await provider.authenticateClient();
							const user = await ctx.context.internalAdapter.findUserById(
								(ctx.body as { user_id: string }).user_id,
							);
							return provider.issueTokens({
								client,
								user: user!,
								scopes: ["read", "offline_access"],
								resources: [api],
								act: { sub: "service-a" },
								refreshToken: parent,
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
					scopes: ["read", "offline_access"],
					resources: [api],
				}),
				delegatingPlugin,
			],
		});
		const { headers, user } = await signInWithTestUser();
		const registered = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: [delegatingGrant, "refresh_token"],
				scope: "read offline_access",
				resources: [api],
			},
		});
		const issue = () =>
			client.$fetch<TokenResponse>("/oauth2/token", {
				method: "POST",
				body: new URLSearchParams({
					grant_type: delegatingGrant,
					client_id: registered.client_id,
					client_secret: registered.client_secret!,
					user_id: user.id,
				}),
				headers: { "content-type": "application/x-www-form-urlencoded" },
			});

		const { data } = await issue();
		expect(decodeJwt(data!.access_token).act).toEqual({ sub: "service-a" });
		expect(data?.refresh_token).toBeUndefined();

		parent = {
			id: "parent-refresh-token",
			token: "parent",
			userId: user.id,
			clientId: registered.client_id,
			scopes: ["read", "offline_access"],
			createdAt: new Date(),
			expiresAt: new Date(Date.now() + 60_000),
		};
		const { error } = await issue();
		expect(error).toMatchObject({
			status: 500,
			error: "server_error",
			error_description: "issueTokens does not accept act with refreshToken",
		});
	});

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

	it("treats an empty subject reference as none", async () => {
		const references: (string | undefined)[] = [];
		const { auth, createClient, userTokenForMcp, exchangeAs } = await boot({
			allowExchange: ({ referenceId }) => {
				references.push(referenceId);
				return true;
			},
		});
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
		await (await auth.$context).adapter.update({
			model: "oauthAccessToken",
			where: [{ field: "clientId", value: bff.client_id }],
			update: { referenceId: "" },
		});
		const { data, error } = await exchangeAs(bff, subject.access_token);
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).reference_id).toBeUndefined();
		expect(references).toEqual([undefined]);
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
 * The consent lookup (including its match for consent stored without a
 * reference), the consent array columns, `reference_id` on JWT and opaque tokens, and opaque-token
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

			// An empty reference is no reference too.
			const blank = await exchanger({
				resources: [mcp, api],
				skip_consent: false,
			});
			await createConsent(auth, {
				clientId: blank.client_id,
				userId,
				referenceId: "",
			});
			const blankExchange = await exchangeAs(blank, subject.access_token);
			expect(blankExchange.error).toBeNull();
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

/**
 * A service that exchanges with an actor token. `delegator` can get its own
 * client_credentials token as the actor, and `downstream` re-exchanges the
 * delegated token to show chains.
 */
async function bootDelegation(
	exchange: OAuthTokenExchangeOptions = {},
	bootOptions: Parameters<typeof bootScenario>[1] = {},
	providerOptions: Partial<OAuthOptions<Scope[]>> = {},
) {
	const scenario = await bootScenario(exchange, bootOptions, providerOptions);
	const machineClient = (resources: string[]) =>
		scenario.exchanger({
			grant_types: [TOKEN_EXCHANGE_GRANT_TYPE, "client_credentials"],
			client_credentials_scopes: ["read"],
			resources,
		});
	const delegator = await machineClient([mcp, api]);
	const downstream = await machineClient([api, other]);
	const actorTokenFor = async (
		requester: { client_id: string; client_secret?: string },
		extraHeaders?: Record<string, string>,
	) => {
		const { data, error } = await scenario.postToken(
			{
				grant_type: "client_credentials",
				client_id: requester.client_id,
				client_secret: requester.client_secret!,
				scope: "read",
				resource: api,
			},
			extraHeaders,
		);
		expect(error).toBeNull();
		return data!;
	};
	const actorParams = (actorToken: string) => ({
		actor_token: actorToken,
		actor_token_type: ACCESS_TOKEN_TYPE,
	});
	/** Exchanges the user's MCP token as `delegator`, with its own actor token. */
	const delegate = async () => {
		const subject = await scenario.userTokenForMcp();
		const actor = await actorTokenFor(delegator);
		return scenario.exchangeAs(
			delegator,
			subject.access_token,
			actorParams(actor.access_token),
		);
	};
	/** Exchanges a delegated token again as `downstream`, with its own actor. */
	const redelegate = async (delegatedToken: string) => {
		const actor = await actorTokenFor(downstream);
		return scenario.exchangeAs(downstream, delegatedToken, {
			...actorParams(actor.access_token),
			resource: other,
		});
	};
	return {
		...scenario,
		redelegate,
		machineClient,
		delegator,
		downstream,
		actorTokenFor,
		actorParams,
		delegate,
	};
}

describe("oauthTokenExchange delegation", () => {
	it("names the actor in act and returns it at introspection", async () => {
		const { delegator, delegate, introspect, userTokenForMcp } =
			await bootDelegation();
		const { data, error } = await delegate();
		expect(error).toBeNull();
		const issued = decodeJwt(data!.access_token);
		expect(issued.act).toEqual({ sub: delegator.client_id });
		expect(issued.sub).toBe(
			decodeJwt((await userTokenForMcp()).access_token).sub,
		);
		expect(await introspect(data!.access_token, delegator)).toMatchObject({
			active: true,
			act: { sub: delegator.client_id },
		});
	});

	it("stores act on an opaque token and returns it at introspection", async () => {
		const { delegator, delegate, introspect } = await bootDelegation(
			{},
			{ disableJwtPlugin: true },
		);
		const { data, error } = await delegate();
		expect(error).toBeNull();
		expect(data!.access_token.split(".")).toHaveLength(1);
		expect(await introspect(data!.access_token, delegator)).toMatchObject({
			active: true,
			act: { sub: delegator.client_id },
		});
	});

	it("nests the subject token's actors under the new actor", async () => {
		const { delegator, downstream, delegate, redelegate } =
			await bootDelegation({ delegation: { maxDepth: 2 } });
		const first = await delegate();
		const { data, error } = await redelegate(first.data!.access_token);
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).act).toEqual({
			sub: downstream.client_id,
			act: { sub: delegator.client_id },
		});
	});

	it("nests act across opaque tokens", async () => {
		const { delegator, downstream, delegate, introspect, redelegate } =
			await bootDelegation(
				{ delegation: { maxDepth: 2 } },
				{ disableJwtPlugin: true },
			);
		const first = await delegate();
		const { data, error } = await redelegate(first.data!.access_token);
		expect(error).toBeNull();
		expect((await introspect(data!.access_token, downstream))?.act).toEqual({
			sub: downstream.client_id,
			act: { sub: delegator.client_id },
		});
	});

	it("keeps the subject token's act when no actor is sent", async () => {
		const { delegator, downstream, delegate, exchangeAs } =
			await bootDelegation();
		const first = await delegate();
		const { data, error } = await exchangeAs(
			downstream,
			first.data!.access_token,
			{ resource: other },
		);
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).act).toEqual({
			sub: delegator.client_id,
		});
	});

	it("rejects a chain longer than maxDepth", async () => {
		const { delegate, redelegate } = await bootDelegation();
		const first = await delegate();
		const { error } = await redelegate(first.data!.access_token);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "delegation exceeds the maximum depth",
		});
	});

	it("rejects every actor with maxDepth 0", async () => {
		const { delegate } = await bootDelegation({ delegation: { maxDepth: 0 } });
		const { error } = await delegate();
		expect(error?.error_description).toBe(
			"delegation exceeds the maximum depth",
		);
	});

	it("rejects an invalid maxDepth at startup", () => {
		expect(() => oauthTokenExchange({ delegation: { maxDepth: -1 } })).toThrow(
			"delegation.maxDepth must be a non-negative integer",
		);
		expect(() =>
			oauthTokenExchange({ delegation: { maxDepth: 1.5 } }),
		).toThrow();
	});

	it("requires actor_token and actor_token_type together", async () => {
		const { delegator, userTokenForMcp, exchangeAs, actorTokenFor } =
			await bootDelegation();
		const subject = await userTokenForMcp();
		const actor = await actorTokenFor(delegator);
		const halves: Record<string, string>[] = [
			{ actor_token: actor.access_token },
			{ actor_token_type: ACCESS_TOKEN_TYPE },
		];
		for (const extra of halves) {
			const { error } = await exchangeAs(
				delegator,
				subject.access_token,
				extra,
			);
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description:
					"actor_token and actor_token_type must be sent together",
			});
		}
	});

	it("accepts only access tokens as actor tokens", async () => {
		const { delegator, userTokenForMcp, exchangeAs, actorTokenFor } =
			await bootDelegation();
		const subject = await userTokenForMcp();
		const actor = await actorTokenFor(delegator);
		const { error } = await exchangeAs(delegator, subject.access_token, {
			actor_token: actor.access_token,
			actor_token_type: "urn:ietf:params:oauth:token-type:id_token",
		});
		expect(error?.error_description).toBe(
			`actor_token_type must be ${ACCESS_TOKEN_TYPE}`,
		);
	});

	it("rejects an actor token issued to another client", async () => {
		const {
			delegator,
			downstream,
			userTokenForMcp,
			exchangeAs,
			actorTokenFor,
			actorParams,
		} = await bootDelegation();
		const subject = await userTokenForMcp();
		// `delegator` is linked to the actor token's audience, but the token was
		// issued to `downstream`.
		const actor = await actorTokenFor(downstream);
		const { error } = await exchangeAs(
			delegator,
			subject.access_token,
			actorParams(actor.access_token),
		);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "actor_token is invalid",
		});
	});

	it("rejects an actor that is the subject token's user", async () => {
		const { createClient, userTokenForMcp, exchangeAs, actorParams } =
			await bootDelegation();
		const service = await createClient({
			grant_types: [TOKEN_EXCHANGE_GRANT_TYPE, "authorization_code"],
			redirect_uris: [redirectUri],
			scope: "openid read write",
			skip_consent: true,
			resources: [mcp, api],
		});
		const subject = await userTokenForMcp();
		const own = await userTokenForMcp({
			requester: service,
			scope: "openid read",
		});
		const { error } = await exchangeAs(
			service,
			subject.access_token,
			actorParams(own.access_token),
		);
		expect(error?.error_description).toBe(
			"actor_token must not represent the subject token's user",
		);
	});

	it("caps the expiry at the actor token's expiry", async () => {
		const { delegate } = await bootDelegation(
			{},
			{},
			{ m2mAccessTokenExpiresIn: 20 },
		);
		const { data, error } = await delegate();
		expect(error).toBeNull();
		expect(data!.expires_in).toBeLessThanOrEqual(20);
	});

	it("passes the actor and act chain to allowExchange", async () => {
		const allowExchange = vi.fn(() => true);
		const { delegator, delegate } = await bootDelegation({ allowExchange });
		await delegate();
		expect(allowExchange).toHaveBeenCalledWith(
			expect.objectContaining({
				actor: expect.objectContaining({
					sub: delegator.client_id,
					token: expect.objectContaining({ client_id: delegator.client_id }),
				}),
				act: { sub: delegator.client_id },
			}),
		);
	});

	it("lets allowExchange require delegation", async () => {
		const { delegator, delegate, userTokenForMcp, exchangeAs } =
			await bootDelegation({ allowExchange: ({ actor }) => !!actor });
		expect((await delegate()).error).toBeNull();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(delegator, subject.access_token);
		expect(error?.error_description).toBe("token exchange denied by policy");
	});

	it("adds actorClaims fields without overriding sub, iss, or earlier actors", async () => {
		const actorClaims = vi.fn(() => ({
			sub: "forged",
			iss: "https://evil.example.com",
			act: { sub: "forged" },
			actor_type: "service",
		}));
		const { delegator, downstream, delegate, redelegate } =
			await bootDelegation({ delegation: { maxDepth: 2, actorClaims } });
		const first = await delegate();
		expect(decodeJwt(first.data!.access_token).act).toEqual({
			sub: delegator.client_id,
			actor_type: "service",
		});
		const { data } = await redelegate(first.data!.access_token);
		expect(decodeJwt(data!.access_token).act).toEqual({
			sub: downstream.client_id,
			actor_type: "service",
			act: { sub: delegator.client_id, actor_type: "service" },
		});
	});

	it("does not run actorClaims without an actor", async () => {
		const actorClaims = vi.fn(() => ({ actor_type: "service" }));
		const { mcpServer, userTokenForMcp, exchangeAs } = await bootDelegation({
			delegation: { actorClaims },
		});
		const subject = await userTokenForMcp();
		const { data } = await exchangeAs(mcpServer, subject.access_token);
		expect(actorClaims).not.toHaveBeenCalled();
		expect(decodeJwt(data!.access_token).act).toBeUndefined();
	});

	it("keeps act owned by the authorization server", async () => {
		const { mcpServer, delegator, delegate, userTokenForMcp, exchangeAs } =
			await bootDelegation(
				{},
				{},
				{ customAccessTokenClaims: () => ({ act: { sub: "forged" } }) },
			);
		const subject = await userTokenForMcp();
		expect(decodeJwt(subject.access_token).act).toBeUndefined();
		const impersonated = await exchangeAs(mcpServer, subject.access_token);
		expect(decodeJwt(impersonated.data!.access_token).act).toBeUndefined();
		const delegated = await delegate();
		expect(decodeJwt(delegated.data!.access_token).act).toEqual({
			sub: delegator.client_id,
		});
	});

	it("rejects a delegated token as the actor token", async () => {
		const { delegator, delegate, userTokenForMcp, exchangeAs, actorParams } =
			await bootDelegation();
		const delegated = await delegate();
		const subject = await userTokenForMcp();
		const { error } = await exchangeAs(
			delegator,
			subject.access_token,
			actorParams(delegated.data!.access_token),
		);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "actor_token must not be a delegated token",
		});
	});

	it("ignores hook changes to the act it receives", async () => {
		const { delegator, downstream, delegate, redelegate } =
			await bootDelegation({
				delegation: {
					maxDepth: 2,
					actorClaims: ({ act }) => {
						if (act) {
							act.sub = "forged";
							if (act.act) act.act.sub = "forged";
						}
						return {};
					},
				},
				allowExchange: ({ subjectToken }) => {
					if (subjectToken.act)
						(subjectToken.act as { sub: string }).sub = "forged";
					return true;
				},
			});
		const first = await delegate();
		const { data } = await redelegate(first.data!.access_token);
		expect(decodeJwt(data!.access_token).act).toEqual({
			sub: downstream.client_id,
			act: { sub: delegator.client_id },
		});
	});

	it("ignores hook changes to expiry, scopes, and the user", async () => {
		const farFuture = Math.floor(Date.now() / 1000) + 86_400;
		let seen:
			| { actorSub: string; userId: string; scopes: string[] }
			| undefined;
		const { delegate } = await bootDelegation(
			{
				allowExchange: (request) => {
					request.scopes.push("write");
					request.user.id = "someone-else";
					if (request.actor) request.actor.sub = "forged-actor";
					(request.subjectToken as { exp: number }).exp = farFuture;
					return true;
				},
				delegation: {
					actorClaims: ({ actor, user, scopes }) => {
						// Changes made by allowExchange do not reach this hook.
						seen = { actorSub: actor.sub, userId: user.id, scopes };
						(actor.token as { exp: number }).exp = farFuture;
						return {};
					},
				},
			},
			{},
			{ m2mAccessTokenExpiresIn: 20 },
		);
		const { data, error } = await delegate();
		expect(error).toBeNull();
		expect(data!.expires_in).toBeLessThanOrEqual(20);
		expect(data!.scope).toBe("read");
		const issued = decodeJwt(data!.access_token);
		expect(issued.sub).not.toBe("someone-else");
		expect(seen).toEqual({
			actorSub: (issued.act as { sub: string }).sub,
			userId: issued.sub,
			scopes: ["read"],
		});
	});

	it("rejects an actor token whose client id equals a user id", async () => {
		let nextClientId: string | undefined;
		const {
			auth,
			headers,
			machineClient,
			userTokenForMcp,
			exchangeAs,
			actorTokenFor,
			actorParams,
		} = await bootDelegation(
			{},
			{},
			{ generateClientId: () => nextClientId ?? generateRandomString(16) },
		);
		const session = await auth.api.getSession({ headers });
		nextClientId = session!.user.id;
		const colliding = await machineClient([mcp, api]);
		expect(colliding.client_id).toBe(session!.user.id);
		nextClientId = undefined;
		const subject = await userTokenForMcp();
		const actor = await actorTokenFor(colliding);
		const { error } = await exchangeAs(
			colliding,
			subject.access_token,
			actorParams(actor.access_token),
		);
		expect(error).toMatchObject({
			error: "invalid_request",
			error_description: "actor_token is invalid",
		});
	});

	it("does not look up a client id as a serial user id", async () => {
		const { auth, delegator, delegate } = await bootDelegation(
			{},
			{ advanced: { database: { generateId: "serial" } } },
		);
		const ctx = await auth.$context;
		const lookup = vi.spyOn(ctx.internalAdapter, "findUserById");
		const { data, error } = await delegate();
		expect(error).toBeNull();
		expect(decodeJwt(data!.access_token).act).toEqual({
			sub: delegator.client_id,
		});
		expect(lookup).not.toHaveBeenCalledWith(delegator.client_id);
		lookup.mockRestore();
	});

	it("reports an opaque token of a deleted user inactive", async () => {
		const { auth, agent, userTokenForMcp, introspect } = await bootDelegation(
			{},
			{ disableJwtPlugin: true },
		);
		const token = await userTokenForMcp();
		expect((await introspect(token.access_token, agent))?.active).toBe(true);
		const ctx = await auth.$context;
		// Adapters without foreign keys, such as memory and MongoDB, keep the
		// token row after its user is deleted. Simulate that lookup result.
		const lookup = vi
			.spyOn(ctx.internalAdapter, "findUserById")
			.mockResolvedValueOnce(null);
		expect(await introspect(token.access_token, agent)).toEqual({
			active: false,
		});
		expect(lookup).toHaveBeenCalled();
		lookup.mockRestore();
	});

	describe("may_act", () => {
		const bootWithMayAct = async () => {
			const state: { mayAct?: unknown } = {};
			const scenario = await bootDelegation(
				{},
				{},
				{
					customAccessTokenClaims: () =>
						state.mayAct === undefined ? {} : { may_act: state.mayAct },
				},
			);
			return { ...scenario, state };
		};

		it("allows an actor that matches every member", async () => {
			const { delegator, delegate, state } = await bootWithMayAct();
			state.mayAct = {
				sub: delegator.client_id,
				client_id: delegator.client_id,
				iss: issuer,
			};
			const { data, error } = await delegate();
			expect(error).toBeNull();
			expect(decodeJwt(data!.access_token).act).toEqual({
				sub: delegator.client_id,
			});
		});

		it.each<[string, Record<string, string> | string]>([
			["another actor", { sub: "someone-else" }],
			["another issuer", { sub: "delegator", iss: "https://other.example" }],
			["a member it cannot evaluate", { sub: "delegator", email: "a@b.c" }],
			["a value that is not an object", "delegator"],
			["an empty object", {}],
		])("denies %s", async (_, mayAct) => {
			const { delegator, delegate, state } = await bootWithMayAct();
			state.mayAct =
				typeof mayAct === "object" && mayAct.sub === "delegator"
					? { ...mayAct, sub: delegator.client_id }
					: mayAct;
			const { error } = await delegate();
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description:
					"the actor is not permitted by the subject token's may_act",
			});
		});

		it("denies an exchange without an actor", async () => {
			const { mcpServer, delegator, userTokenForMcp, exchangeAs, state } =
				await bootWithMayAct();
			state.mayAct = { sub: delegator.client_id };
			const subject = await userTokenForMcp();
			const { error } = await exchangeAs(mcpServer, subject.access_token);
			expect(error?.error_description).toBe(
				"the actor is not permitted by the subject token's may_act",
			);
		});
	});

	describe("an actor bound by client authentication", () => {
		const authMethod = "test_attestation_jwt";
		const assertionType =
			"urn:better-auth:test:client-assertion-type:test-attestation";
		const boundGrant = "urn:better-auth:test:bound-actor";

		async function bootBoundActor() {
			const state: { confirmation?: Confirmation } = {};
			const plugin = {
				id: "test-bound-actor",
				init(ctx) {
					extendOAuthProvider(ctx, {
						clientAuthentication: {
							[authMethod]: {
								assertionTypes: [assertionType],
								authenticate: async ({ clientId }) => ({
									clientId: clientId!,
									confirmation: state.confirmation,
								}),
							},
						},
						// Issues an actor token bound to what client authentication proved.
						grants: {
							[boundGrant]: async ({ provider }) => {
								const { client, confirmation } =
									await provider.authenticateClient();
								return provider.issueTokens({
									client,
									scopes: ["read"],
									resources: [api],
									confirmation,
								});
							},
						},
					});
				},
			} satisfies BetterAuthPlugin;
			const allowExchange = vi.fn(() => true);
			const scenario = await bootDelegation(
				{ allowExchange },
				{ plugins: [plugin] },
			);
			const service = await scenario.createClient({
				token_endpoint_auth_method: authMethod,
				grant_types: [TOKEN_EXCHANGE_GRANT_TYPE, boundGrant],
				scope: "read write",
				skip_consent: true,
				resources: [mcp, api],
			});
			const clientAuth = {
				client_id: service.client_id,
				client_assertion_type: assertionType,
				client_assertion: `assertion:${service.client_id}`,
			};
			/** Issues an actor token bound to `confirmation`. */
			const issueActor = async (confirmation: Confirmation) => {
				state.confirmation = confirmation;
				const { data, error } = await scenario.postToken({
					grant_type: boundGrant,
					...clientAuth,
				});
				expect(error).toBeNull();
				expect(decodeJwt(data!.access_token).cnf).toEqual(confirmation);
				return data!.access_token;
			};
			/** Exchanges as the service while authentication proves `confirmation`. */
			const exchange = async (
				actorToken: string,
				confirmation: Confirmation | undefined,
			) => {
				state.confirmation = confirmation;
				const subject = await scenario.userTokenForMcp();
				return scenario.postToken({
					grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
					...clientAuth,
					subject_token: subject.access_token,
					subject_token_type: ACCESS_TOKEN_TYPE,
					...scenario.actorParams(actorToken),
					resource: api,
				});
			};
			return { service, allowExchange, issueActor, exchange };
		}

		it("accepts a certificate-bound actor when authentication proves the same certificate", async () => {
			const { service, issueActor, exchange } = await bootBoundActor();
			const certificate = { "x5t#S256": "certificate-a" };
			const actor = await issueActor(certificate);
			const { data, error } = await exchange(actor, certificate);
			expect(error).toBeNull();
			const issued = decodeJwt(data!.access_token);
			expect(issued.cnf).toEqual(certificate);
			expect(issued.act).toEqual({ sub: service.client_id });
		});

		it.each([
			["a different certificate", { "x5t#S256": "certificate-b" }],
			["no confirmation", undefined],
		] satisfies [string, Confirmation | undefined][])(
			"rejects a certificate-bound actor with %s before allowExchange runs",
			async (_, proven) => {
				const { allowExchange, issueActor, exchange } = await bootBoundActor();
				const actor = await issueActor({ "x5t#S256": "certificate-a" });
				const { error } = await exchange(actor, proven);
				expect(error).toMatchObject({
					error: "invalid_request",
					error_description:
						"actor_token is bound to a key the request does not prove",
				});
				expect(allowExchange).not.toHaveBeenCalled();
			},
		);

		it("accepts a matching confirmation in place of a DPoP proof", async () => {
			const { issueActor, exchange } = await bootBoundActor();
			const key = { jkt: "dpop-key-a" };
			const actor = await issueActor(key);
			const { data, error } = await exchange(actor, key);
			expect(error).toBeNull();
			expect(data?.token_type).toBe("DPoP");
			expect(decodeJwt(data!.access_token).cnf).toEqual(key);
		});
	});

	describe("DPoP", () => {
		it("requires a proof from the key an actor token is bound to", async () => {
			const {
				delegator,
				userTokenForMcp,
				exchangeAs,
				actorTokenFor,
				actorParams,
			} = await bootDelegation();
			const key = await createDpopKey();
			const actor = await actorTokenFor(delegator, { DPoP: await key.prove() });
			expect(actor.token_type).toBe("DPoP");
			const subject = await userTokenForMcp();

			const missing = await exchangeAs(
				delegator,
				subject.access_token,
				actorParams(actor.access_token),
			);
			expect(missing.error?.error).toBe("invalid_dpop_proof");

			const otherKey = await createDpopKey();
			const wrong = await exchangeAs(
				delegator,
				subject.access_token,
				actorParams(actor.access_token),
				{ DPoP: await otherKey.prove() },
			);
			expect(wrong.error?.error).toBe("invalid_dpop_proof");

			const { data, error } = await exchangeAs(
				delegator,
				subject.access_token,
				actorParams(actor.access_token),
				{ DPoP: await key.prove() },
			);
			expect(error).toBeNull();
			expect(data?.token_type).toBe("DPoP");
			const issued = decodeJwt(data!.access_token);
			expect(issued.cnf).toEqual({ jkt: await deriveDpopJkt(key.publicJwk) });
			expect(issued.act).toEqual({ sub: delegator.client_id });
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10892
 */
describe("oauthTokenExchange with pairwise access token subjects", () => {
	it("resolves the user behind a pairwise subject token", async () => {
		const {
			auth,
			headers,
			createClient,
			mcpServer,
			userTokenForMcp,
			exchangeAs,
		} = await bootScenario(
			{},
			{},
			{
				pairwiseSecret: "test-pairwise-secret-key-32chars!!",
				accessTokenSubject: "pairwise",
			},
		);
		const pairwiseAgent = await createClient({
			redirect_uris: [redirectUri],
			scope: "openid profile read write offline_access",
			skip_consent: true,
			resources: [mcp],
			subject_type: "pairwise",
		});
		const session = await auth.api.getSession({ headers });
		const subject = await userTokenForMcp({ requester: pairwiseAgent });
		expect(decodeJwt(subject.access_token).sub).not.toBe(session!.user.id);

		const { data, error } = await exchangeAs(mcpServer, subject.access_token);
		expect(error).toBeNull();
		// The exchanging client has the public subject type, so it sees the user ID.
		expect(decodeJwt(data!.access_token).sub).toBe(session!.user.id);
	});
});

describe("oauthTokenExchange public clients", () => {
	async function bootPublicClient(
		publicClients?: OAuthTokenExchangeOptions["publicClients"],
	) {
		const allowExchange = vi.fn(() => true);
		const scenario = await bootScenario({ publicClients, allowExchange });
		const app = await scenario.createClient({
			token_endpoint_auth_method: "none",
			grant_types: ["authorization_code", TOKEN_EXCHANGE_GRANT_TYPE],
			redirect_uris: [redirectUri],
			scope: "openid read write",
			skip_consent: true,
			// Linked to mcp, so it is in the audience of the agent's MCP tokens.
			resources: [mcp, api],
		});
		const key = await createDpopKey();
		/** A user token issued to the public client and bound to `key`. */
		const ownBoundToken = async () => {
			const token = await scenario.userTokenForMcp({
				scope: "openid read",
				requester: app,
				clientAuth: {},
				tokenHeaders: { DPoP: await key.prove() },
			});
			expect(token.token_type).toBe("DPoP");
			return token;
		};
		/** Exchanges as the public client: `client_id` only, no secret. */
		const exchange = (
			subjectToken: string,
			extraHeaders?: Record<string, string>,
			extra: Record<string, string> = {},
		) => scenario.exchangeAs(app, subjectToken, extra, extraHeaders);
		return {
			...scenario,
			app,
			key,
			allowExchange,
			ownBoundToken,
			exchange,
		};
	}

	it("refuses a public client by default", async () => {
		const { ownBoundToken, exchange, key } = await bootPublicClient();
		const subject = await ownBoundToken();
		const { error } = await exchange(subject.access_token, {
			DPoP: await key.prove(),
		});
		expect(error?.error).toBe("invalid_client");
	});

	describe('with publicClients: "dpop-bound"', () => {
		it("exchanges the client's own DPoP-bound token for a token bound to the same key", async () => {
			const { ownBoundToken, exchange, key, introspect, mcpServer } =
				await bootPublicClient("dpop-bound");
			const subject = await ownBoundToken();
			const { data, error } = await exchange(subject.access_token, {
				DPoP: await key.prove(),
			});
			expect(error).toBeNull();
			expect(data?.token_type).toBe("DPoP");
			expect(data?.refresh_token).toBeUndefined();
			const issued = decodeJwt(data!.access_token);
			expect(issued.aud).toBe(api);
			expect(issued.cnf).toEqual({ jkt: await deriveDpopJkt(key.publicJwk) });
			// The issued token is still active for a resource server of api.
			expect((await introspect(data!.access_token, mcpServer))?.active).toBe(
				true,
			);
		});

		it("requires a DPoP proof before allowExchange runs", async () => {
			const { ownBoundToken, exchange, allowExchange } =
				await bootPublicClient("dpop-bound");
			const subject = await ownBoundToken();
			const { error } = await exchange(subject.access_token);
			expect(error).toMatchObject({
				error: "invalid_dpop_proof",
				error_description: "DPoP proof header is required",
			});
			expect(allowExchange).not.toHaveBeenCalled();
		});

		it("requires the proof to use the subject token's key", async () => {
			const { ownBoundToken, exchange } = await bootPublicClient("dpop-bound");
			const subject = await ownBoundToken();
			const otherKey = await createDpopKey();
			const { error } = await exchange(subject.access_token, {
				DPoP: await otherKey.prove(),
			});
			expect(error).toMatchObject({
				error: "invalid_dpop_proof",
				error_description: "DPoP proof key does not match the bound token",
			});
		});

		it("refuses a token issued to another client, even for a resource it serves", async () => {
			const { userTokenForMcp, exchange, key, allowExchange } =
				await bootPublicClient("dpop-bound");
			// The agent's token for mcp, whose audience the public client serves.
			const subject = await userTokenForMcp({
				tokenHeaders: { DPoP: await key.prove() },
			});
			const { error } = await exchange(subject.access_token, {
				DPoP: await key.prove(),
			});
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description: "subject_token is invalid",
			});
			expect(allowExchange).not.toHaveBeenCalled();
		});

		it("refuses its own bearer token, so a stolen one cannot be bound to a new key", async () => {
			const { app, userTokenForMcp, exchange, key, allowExchange } =
				await bootPublicClient("dpop-bound");
			const subject = await userTokenForMcp({
				scope: "openid read",
				requester: app,
				clientAuth: {},
			});
			expect(subject.token_type).toBe("Bearer");
			const { error } = await exchange(subject.access_token, {
				DPoP: await key.prove(),
			});
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description:
					"a public client may only exchange a DPoP-bound subject_token",
			});
			expect(allowExchange).not.toHaveBeenCalled();
		});

		it("refuses an actor_token from a public client", async () => {
			const { ownBoundToken, exchange, key } =
				await bootPublicClient("dpop-bound");
			const subject = await ownBoundToken();
			const { error } = await exchange(
				subject.access_token,
				{ DPoP: await key.prove() },
				{
					actor_token: subject.access_token,
					actor_token_type: ACCESS_TOKEN_TYPE,
				},
			);
			expect(error).toMatchObject({
				error: "invalid_request",
				error_description: "a public client cannot send actor_token",
			});
		});

		it("still requires a confidential client to authenticate", async () => {
			const { mcpServer, userTokenForMcp, postToken } =
				await bootPublicClient("dpop-bound");
			const subject = await userTokenForMcp();
			const { error } = await postToken({
				grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
				client_id: mcpServer.client_id,
				subject_token: subject.access_token,
				subject_token_type: ACCESS_TOKEN_TYPE,
				resource: api,
			});
			expect(error?.error).toBe("invalid_client");
		});
	});
});
