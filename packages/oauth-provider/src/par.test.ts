import { generateRandomString } from "better-auth/crypto";
import { deriveDpopJkt, generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";
import type { OAuthOptions, Scope } from "./types";

const baseURL = "http://localhost:3000";
const parEndpoint = `${baseURL}/api/auth/oauth2/par`;
const authorizeEndpoint = `${baseURL}/api/auth/oauth2/authorize`;
const tokenEndpoint = `${baseURL}/api/auth/oauth2/token`;
const redirectUri = "https://rp.example.com/api/auth/callback/test";
const requestUriPrefix = "urn:ietf:params:oauth:request_uri:";

async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}

type DpopKey = Awaited<ReturnType<typeof createDpopKey>>;

function createProof(key: DpopKey, url: string, nonce?: string) {
	return new SignJWT({
		jti: generateRandomString(16),
		htm: "POST",
		htu: url,
		iat: Math.floor(Date.now() / 1000),
		...(nonce ? { nonce } : {}),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}

async function setup(
	providerOptions: Partial<OAuthOptions<Scope[]>> = {
		pushedAuthorizationRequests: { enabled: true },
	},
) {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					...providerOptions,
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);
	const { headers } = await signInWithTestUser();

	async function createClient(
		body: Partial<
			NonNullable<Parameters<typeof auth.api.adminCreateOAuthClient>[0]>["body"]
		> = {},
	) {
		return auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				redirect_uris: [redirectUri],
				skip_consent: true,
				...body,
			},
		});
	}

	async function authorizationParams(clientId: string) {
		const codeVerifier = generateRandomString(43);
		return {
			codeVerifier,
			params: {
				client_id: clientId,
				response_type: "code",
				redirect_uri: redirectUri,
				scope: "openid",
				state: "par-state",
				code_challenge: await generateCodeChallenge(codeVerifier),
				code_challenge_method: "S256",
			} as Record<string, string>,
		};
	}

	async function pushRequest(
		body: Record<string, string>,
		requestHeaders: Record<string, string> = {},
	) {
		const response = await customFetchImpl(parEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...requestHeaders,
			},
			body: new URLSearchParams(body).toString(),
		});
		const text = await response.text();
		return {
			response,
			body: (text ? JSON.parse(text) : {}) as Record<string, unknown>,
		};
	}

	/** Sends the browser to the authorization endpoint and returns `Location`. */
	async function authorize(
		params: Record<string, string>,
		sessionHeaders: Headers = headers,
	) {
		const url = new URL(authorizeEndpoint);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		const response = await customFetchImpl(url.toString(), {
			headers: sessionHeaders,
			redirect: "manual",
		});
		return new URL(response.headers.get("Location") ?? "", baseURL);
	}

	async function redeem(
		client: { client_id: string; client_secret?: string },
		code: string,
		codeVerifier: string,
		dpopProof?: string,
	) {
		const response = await customFetchImpl(tokenEndpoint, {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				code,
				code_verifier: codeVerifier,
				redirect_uri: redirectUri,
				client_id: client.client_id,
				...(client.client_secret
					? { client_secret: client.client_secret }
					: {}),
			}).toString(),
		});
		return {
			response,
			body: (await response.json()) as Record<string, unknown>,
		};
	}

	return {
		auth,
		headers,
		customFetchImpl,
		createClient,
		authorizationParams,
		pushRequest,
		authorize,
		redeem,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe("pushed authorization requests", async () => {
	const {
		auth,
		createClient,
		authorizationParams,
		pushRequest,
		authorize,
		redeem,
	} = await setup();
	const client = await createClient();
	const credentials = {
		client_id: client.client_id,
		client_secret: client.client_secret!,
	};

	it("advertises the endpoint in both discovery documents", async () => {
		const openid = await auth.api.getOpenIdConfig();
		const oauth = await auth.api.getOAuthServerConfig();
		for (const metadata of [openid, oauth]) {
			expect(metadata).toMatchObject({
				pushed_authorization_request_endpoint: parEndpoint,
				require_pushed_authorization_requests: false,
			});
		}
		// A pushed request_uri works without request_uri_parameter_supported,
		// which covers request objects hosted by the client.
		expect(openid.request_uri_parameter_supported).toBe(false);
	});

	it("returns a single-use request_uri that completes the code flow", async () => {
		const { params, codeVerifier } = await authorizationParams(
			client.client_id,
		);
		const pushed = await pushRequest({ ...params, ...credentials });

		expect(pushed.response.status).toBe(201);
		expect(pushed.response.headers.get("Cache-Control")).toBe("no-store");
		expect(pushed.body).toEqual({
			request_uri: expect.stringMatching(
				new RegExp(`^${requestUriPrefix}[A-Za-z0-9]{32,}$`),
			),
			expires_in: 60,
		});
		const requestUri = pushed.body.request_uri as string;

		const location = await authorize({
			client_id: client.client_id,
			request_uri: requestUri,
		});
		expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
		expect(location.searchParams.get("state")).toBe("par-state");
		const code = location.searchParams.get("code");
		expect(code).toEqual(expect.any(String));

		const tokens = await redeem(credentials, code!, codeVerifier);
		expect(tokens.response.status).toBe(200);
		expect(tokens.body.token_type).toBe("Bearer");

		const replay = await authorize({
			client_id: client.client_id,
			request_uri: requestUri,
		});
		expect(replay.searchParams.get("error")).toBe("invalid_request_uri");
		expect(replay.searchParams.get("code")).toBeNull();
	});

	it("issues one code when the same request_uri is used concurrently", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });
		const authorizeOnce = () =>
			authorize({
				client_id: client.client_id,
				request_uri: pushed.body.request_uri as string,
			});

		const locations = await Promise.all([
			authorizeOnce(),
			authorizeOnce(),
			authorizeOnce(),
		]);
		const codes = locations.filter((location) =>
			location.searchParams.get("code"),
		);
		expect(codes).toHaveLength(1);
	});

	it.each([
		["the token endpoint", tokenEndpoint],
		["the PAR endpoint", parEndpoint],
		["the issuer", baseURL],
	])("accepts a private_key_jwt assertion addressed to %s", async (_, aud) => {
		const { privateKey, publicKey } = await generateKeyPair("RS256", {
			extractable: true,
		});
		const keyClient = await createClient({
			token_endpoint_auth_method: "private_key_jwt",
			jwks: {
				keys: [
					{
						...(await exportJWK(publicKey)),
						kid: "par-key",
						alg: "RS256",
						use: "sig",
					},
				],
			},
		});
		const now = Math.floor(Date.now() / 1000);
		const assertion = await new SignJWT({})
			.setProtectedHeader({ alg: "RS256", kid: "par-key" })
			.setIssuer(keyClient.client_id)
			.setSubject(keyClient.client_id)
			.setAudience(aud)
			.setIssuedAt(now)
			.setExpirationTime(now + 60)
			.setJti(generateRandomString(16))
			.sign(privateKey);
		const { params } = await authorizationParams(keyClient.client_id);
		const pushed = await pushRequest({
			...params,
			client_assertion_type:
				"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: assertion,
		});
		expect(pushed.response.status).toBe(201);
	});

	it("does not let a request_uri and an authorization code consume each other", async () => {
		const first = await authorizationParams(client.client_id);
		const firstPush = await pushRequest({ ...first.params, ...credentials });
		const issued = await authorize({
			client_id: client.client_id,
			request_uri: firstPush.body.request_uri as string,
		});
		const code = issued.searchParams.get("code")!;
		const asRequestUri = await authorize({
			client_id: client.client_id,
			request_uri: `${requestUriPrefix}${code}`,
		});
		expect(asRequestUri.searchParams.get("error")).toBe("invalid_request_uri");
		const tokens = await redeem(credentials, code, first.codeVerifier);
		expect(tokens.response.status).toBe(200);

		const second = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...second.params, ...credentials });
		const requestUri = pushed.body.request_uri as string;
		const asCode = await redeem(
			credentials,
			requestUri.slice(requestUriPrefix.length),
			second.codeVerifier,
		);
		expect(asCode.body).toMatchObject({ error: "invalid_grant" });
		const location = await authorize({
			client_id: client.client_id,
			request_uri: requestUri,
		});
		expect(location.searchParams.get("code")).toEqual(expect.any(String));
	});

	it("binds the request_uri to the client that pushed it", async () => {
		const otherClient = await createClient();
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });

		const location = await authorize({
			client_id: otherClient.client_id,
			request_uri: pushed.body.request_uri as string,
		});
		expect(location.searchParams.get("error")).toBe("invalid_request_uri");
		expect(location.searchParams.get("code")).toBeNull();
	});

	it("expires the request_uri after expires_in", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });

		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + 61_000);
		const location = await authorize({
			client_id: client.client_id,
			request_uri: pushed.body.request_uri as string,
		});
		expect(location.searchParams.get("error")).toBe("invalid_request_uri");
	});

	it("uses only the pushed parameters, ignoring ones added to the URL", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });

		const location = await authorize({
			client_id: client.client_id,
			request_uri: pushed.body.request_uri as string,
			state: "tampered",
		});
		expect(location.searchParams.get("state")).toBe("par-state");
	});

	it("rejects a request_uri inside the pushed request", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({
			...params,
			...credentials,
			request_uri: `${requestUriPrefix}abc`,
		});
		expect(pushed.response.status).toBe(400);
		expect(pushed.body).toMatchObject({ error: "invalid_request" });
	});

	it("rejects a request object", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({
			...params,
			...credentials,
			request: "eyJhbGciOiJub25lIn0.e30.",
		});
		expect(pushed.response.status).toBe(400);
		expect(pushed.body).toMatchObject({ error: "request_not_supported" });
	});

	it("authenticates the client as the token endpoint does", async () => {
		const { params } = await authorizationParams(client.client_id);
		const missingSecret = await pushRequest({
			...params,
			client_id: client.client_id,
		});
		expect(missingSecret.response.status).toBe(400);
		expect(missingSecret.body).toMatchObject({ error: "invalid_client" });

		const wrongSecret = await pushRequest({
			...params,
			client_id: client.client_id,
			client_secret: "wrong",
		});
		expect(wrongSecret.response.status).toBe(400);
		expect(wrongSecret.body).toMatchObject({ error: "invalid_client" });
	});

	it("accepts a public client identified by client_id", async () => {
		const publicClient = await createClient({
			token_endpoint_auth_method: "none",
		});
		const { params, codeVerifier } = await authorizationParams(
			publicClient.client_id,
		);
		const pushed = await pushRequest(params);
		expect(pushed.response.status).toBe(201);

		const location = await authorize({
			client_id: publicClient.client_id,
			request_uri: pushed.body.request_uri as string,
		});
		const code = location.searchParams.get("code");
		expect(code).toEqual(expect.any(String));
		const tokens = await redeem(
			{ client_id: publicClient.client_id },
			code!,
			codeVerifier,
		);
		expect(tokens.response.status).toBe(200);
	});

	it("validates the request like the authorization endpoint", async () => {
		const { params } = await authorizationParams(client.client_id);

		const unregisteredRedirect = await pushRequest({
			...params,
			...credentials,
			redirect_uri: "https://attacker.example.com/callback",
		});
		expect(unregisteredRedirect.response.status).toBe(400);
		expect(unregisteredRedirect.body).toMatchObject({
			error: "invalid_redirect",
		});

		const invalidScope = await pushRequest({
			...params,
			...credentials,
			scope: "openid not-a-scope",
		});
		expect(invalidScope.response.status).toBe(400);
		expect(invalidScope.body).toMatchObject({ error: "invalid_scope" });

		const unsupportedResponseType = await pushRequest({
			...params,
			...credentials,
			response_type: "token",
		});
		expect(unsupportedResponseType.response.status).toBe(400);
		expect(unsupportedResponseType.body).toMatchObject({
			error: "unsupported_response_type",
		});
	});

	it("rejects a client_id that differs from the authenticated client", async () => {
		const otherClient = await createClient();
		const { params } = await authorizationParams(otherClient.client_id);
		const pushed = await pushRequest(
			{ ...params, client_id: otherClient.client_id },
			{
				authorization: `Basic ${btoa(`${client.client_id}:${client.client_secret}`)}`,
			},
		);
		expect(pushed.response.status).toBe(401);
		expect(pushed.body).toMatchObject({ error: "invalid_client" });
	});

	it("keeps client credentials out of the stored request", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });
		const context = await auth.$context;
		const rows = await context.adapter.findMany<{
			identifier: string;
			value: string;
		}>({ model: "verification" });
		const stored = rows.find((row) =>
			row.identifier.startsWith("pushed_authorization_request:"),
		);
		expect(stored).toBeDefined();
		expect(stored!.value).not.toContain(client.client_secret!);
		expect(stored!.value).not.toContain(pushed.body.request_uri as string);
	});

	describe("DPoP (RFC 9449 §10.1)", () => {
		it("binds the authorization code to the key of the PAR proof", async () => {
			const key = await createDpopKey();
			const { params, codeVerifier } = await authorizationParams(
				client.client_id,
			);
			const pushed = await pushRequest(
				{ ...params, ...credentials },
				{ DPoP: await createProof(key, parEndpoint) },
			);
			expect(pushed.response.status).toBe(201);

			const location = await authorize({
				client_id: client.client_id,
				request_uri: pushed.body.request_uri as string,
			});
			const code = location.searchParams.get("code")!;

			const otherKey = await createDpopKey();
			const wrongKey = await redeem(
				credentials,
				code,
				codeVerifier,
				await createProof(otherKey, tokenEndpoint),
			);
			expect(wrongKey.response.status).toBe(400);
			expect(wrongKey.body).toMatchObject({ error: "invalid_dpop_proof" });
		});

		it("issues DPoP-bound tokens to the same key", async () => {
			const key = await createDpopKey();
			const { params, codeVerifier } = await authorizationParams(
				client.client_id,
			);
			const pushed = await pushRequest(
				{ ...params, ...credentials },
				{ DPoP: await createProof(key, parEndpoint) },
			);
			const location = await authorize({
				client_id: client.client_id,
				request_uri: pushed.body.request_uri as string,
			});
			const tokens = await redeem(
				credentials,
				location.searchParams.get("code")!,
				codeVerifier,
				await createProof(key, tokenEndpoint),
			);
			expect(tokens.response.status).toBe(200);
			expect(tokens.body.token_type).toBe("DPoP");
			expect(decodeJwt(tokens.body.id_token as string)).toBeDefined();
		});

		it("rejects a dpop_jkt that differs from the proof key", async () => {
			const key = await createDpopKey();
			const otherKey = await createDpopKey();
			const { params } = await authorizationParams(client.client_id);
			const pushed = await pushRequest(
				{ ...params, ...credentials, dpop_jkt: otherKey.jkt },
				{ DPoP: await createProof(key, parEndpoint) },
			);
			expect(pushed.response.status).toBe(400);
			expect(pushed.body).toMatchObject({ error: "invalid_request" });
		});

		it("rejects a proof for another endpoint", async () => {
			const key = await createDpopKey();
			const { params } = await authorizationParams(client.client_id);
			const pushed = await pushRequest(
				{ ...params, ...credentials },
				{ DPoP: await createProof(key, tokenEndpoint) },
			);
			expect(pushed.response.status).toBe(400);
			expect(pushed.body).toMatchObject({ error: "invalid_dpop_proof" });
		});

		it("keeps a pushed dpop_jkt without a proof", async () => {
			const key = await createDpopKey();
			const { params, codeVerifier } = await authorizationParams(
				client.client_id,
			);
			const pushed = await pushRequest({
				...params,
				...credentials,
				dpop_jkt: key.jkt,
			});
			expect(pushed.response.status).toBe(201);
			const location = await authorize({
				client_id: client.client_id,
				request_uri: pushed.body.request_uri as string,
			});
			const withoutProof = await redeem(
				credentials,
				location.searchParams.get("code")!,
				codeVerifier,
			);
			expect(withoutProof.response.status).toBe(400);
			expect(withoutProof.body).toMatchObject({ error: "invalid_dpop_proof" });
		});
	});

	it("declares a rate limit rule for the endpoint", async () => {
		const plugin = (await auth.$context).getPlugin("oauth-provider")!;
		const rule = plugin.rateLimit?.find((rule) =>
			rule.pathMatcher("/oauth2/par"),
		);
		expect(rule).toMatchObject({ window: 60, max: 20 });
	});
});

/**
 * @see https://www.rfc-editor.org/rfc/rfc9449#section-8
 */
describe("pushed authorization requests with required DPoP nonces", async () => {
	const { createClient, authorizationParams, pushRequest } = await setup({
		pushedAuthorizationRequests: { enabled: true },
		dpop: { nonce: { required: true } },
	});
	const client = await createClient();

	it("challenges for a nonce and returns a fresh one with the request_uri", async () => {
		const key = await createDpopKey();
		const { params } = await authorizationParams(client.client_id);
		const body = { ...params, client_secret: client.client_secret! };

		const challenged = await pushRequest(body, {
			DPoP: await createProof(key, parEndpoint),
		});
		expect(challenged.response.status).toBe(400);
		expect(challenged.body).toMatchObject({ error: "use_dpop_nonce" });
		const nonce = challenged.response.headers.get("DPoP-Nonce");
		expect(nonce).toBeTruthy();

		const pushed = await pushRequest(body, {
			DPoP: await createProof(key, parEndpoint, nonce!),
		});
		expect(pushed.response.status).toBe(201);
		expect(pushed.response.headers.get("DPoP-Nonce")).toBeTruthy();
	});
});

describe("pushed authorization requests disabled", async () => {
	const { auth, createClient, authorizationParams, pushRequest } = await setup(
		{},
	);
	const client = await createClient();

	it("does not serve or advertise the endpoint", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({
			...params,
			client_secret: client.client_secret!,
		});
		expect(pushed.response.status).toBe(404);

		const metadata = await auth.api.getOpenIdConfig();
		expect(metadata).not.toHaveProperty(
			"pushed_authorization_request_endpoint",
		);
		expect(metadata).not.toHaveProperty(
			"require_pushed_authorization_requests",
		);
	});
});

describe("pushed authorization requests required for every client", async () => {
	const {
		auth,
		headers,
		customFetchImpl,
		createClient,
		authorizationParams,
		pushRequest,
		authorize,
	} = await setup({
		pushedAuthorizationRequests: { enabled: true, required: true },
	});
	const client = await createClient({ skip_consent: false });
	const credentials = {
		client_id: client.client_id,
		client_secret: client.client_secret!,
	};

	it("advertises the requirement", async () => {
		const metadata = await auth.api.getOAuthServerConfig();
		expect(metadata.require_pushed_authorization_requests).toBe(true);
	});

	it("rejects a plain authorization request", async () => {
		const { params } = await authorizationParams(client.client_id);
		const location = await authorize(params);
		expect(`${location.origin}${location.pathname}`).toBe(redirectUri);
		expect(location.searchParams.get("error")).toBe("invalid_request");
		expect(location.searchParams.get("error_description")).toBe(
			"pushed authorization request is required",
		);
		expect(location.searchParams.get("state")).toBe("par-state");
		expect(location.searchParams.get("code")).toBeNull();
	});

	it("continues a pushed request through login and consent", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({ ...params, ...credentials });

		// Without a session, the request goes to the login page with the
		// server-signed parameters.
		const login = await authorize(
			{
				client_id: client.client_id,
				request_uri: pushed.body.request_uri as string,
			},
			new Headers(),
		);
		expect(login.pathname).toBe("/login");
		expect(login.searchParams.get("request_uri")).toBeNull();
		expect(login.searchParams.get("state")).toBe("par-state");

		const signIn = await customFetchImpl(`${baseURL}/api/auth/sign-in/email`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				email: "test@test.com",
				password: "test123456",
				oauth_query: login.searchParams.toString(),
			}),
		});
		const continued = (await signIn.json()) as { url: string };
		const consentUrl = new URL(continued.url, baseURL);
		expect(consentUrl.pathname).toBe("/consent");

		const consented = await auth.api.oauth2Consent({
			headers,
			body: { accept: true, oauth_query: consentUrl.searchParams.toString() },
		});
		expect(consented).toMatchObject({
			redirect: true,
			url: expect.stringContaining(`${redirectUri}?code=`),
		});
	});
});

describe("pushed authorization requests required per client", async () => {
	const { auth, headers, createClient, authorizationParams, authorize } =
		await setup({
			pushedAuthorizationRequests: { enabled: true },
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		});

	it("rejects a plain request only for clients that require PAR", async () => {
		const strictClient = await createClient({
			require_pushed_authorization_requests: true,
		});
		expect(strictClient.require_pushed_authorization_requests).toBe(true);
		const looseClient = await createClient();
		expect(looseClient.require_pushed_authorization_requests).toBeFalsy();

		const strict = await authorize(
			(await authorizationParams(strictClient.client_id)).params,
		);
		expect(strict.searchParams.get("error")).toBe("invalid_request");
		expect(strict.searchParams.get("code")).toBeNull();

		const loose = await authorize(
			(await authorizationParams(looseClient.client_id)).params,
		);
		expect(loose.searchParams.get("code")).toEqual(expect.any(String));
	});

	it("lets a client register the requirement dynamically", async () => {
		const registered = await auth.api.registerOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				token_endpoint_auth_method: "none",
				require_pushed_authorization_requests: true,
			},
		});
		expect(registered.require_pushed_authorization_requests).toBe(true);

		const location = await authorize(
			(await authorizationParams(registered.client_id)).params,
		);
		expect(location.searchParams.get("error")).toBe("invalid_request");
	});
});

describe("pushed authorization requests with requestUriResolver", async () => {
	const resolved: string[] = [];
	const { createClient, authorizationParams, pushRequest, authorize } =
		await setup({
			pushedAuthorizationRequests: { enabled: true },
			async requestUriResolver({ requestUri, clientId }) {
				resolved.push(requestUri);
				if (requestUri !== "urn:example:app-hosted") return null;
				const { params } = await authorizationParams(clientId);
				return { ...params, state: "from-resolver" };
			},
		});
	const client = await createClient();

	it("resolves its own request_uri before calling the resolver", async () => {
		const { params } = await authorizationParams(client.client_id);
		const pushed = await pushRequest({
			...params,
			client_secret: client.client_secret!,
		});
		const location = await authorize({
			client_id: client.client_id,
			request_uri: pushed.body.request_uri as string,
		});
		expect(location.searchParams.get("state")).toBe("par-state");
		expect(resolved).toEqual([]);
	});

	it("passes any other request_uri to the resolver", async () => {
		const location = await authorize({
			client_id: client.client_id,
			request_uri: "urn:example:app-hosted",
		});
		expect(location.searchParams.get("state")).toBe("from-resolver");
		expect(resolved).toEqual(["urn:example:app-hosted"]);
	});
});

describe("pushedAuthorizationRequests options", () => {
	it("rejects a required policy without the endpoint", () => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pushedAuthorizationRequests: { enabled: false, required: true },
			}),
		).toThrow(/enabled/);
	});

	it.each([0, 600, 1.5])("rejects expiresIn %s", (expiresIn) => {
		expect(() =>
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pushedAuthorizationRequests: { enabled: true, expiresIn },
			}),
		).toThrow(/expiresIn/);
	});
});
