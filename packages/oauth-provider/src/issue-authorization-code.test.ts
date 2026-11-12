import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { deriveDpopJkt, generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth/types";
import type { JWK } from "jose";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import * as z from "zod";
import { oauthDeviceAuthorization } from "./device-code";
import { oauthProvider } from "./oauth";
import { getOAuthProviderApi } from "./token";
import type { OAuthOptions, Scope, StoredAuthorizationQuery } from "./types";
import type { OAuthClient } from "./types/oauth";
import { storeToken } from "./utils";

/**
 * A plugin that collects authorization requests and authenticates users itself,
 * as a first-party sign-in endpoint does, and issues codes through the
 * provider API.
 */
const codeIssuer = {
	id: "test-code-issuer",
	endpoints: {
		testValidateAuthorizationRequest: createAuthEndpoint(
			"/test/validate-authorization-request",
			{
				method: "POST",
				body: z.object({
					clientId: z.string(),
					request: z.record(z.string(), z.unknown()),
					mode: z.enum(["redirect", "headless"]),
				}),
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const client = await provider.getClient(ctx.body.clientId);
				if (!client) throw new Error("test client not found");
				return ctx.json(
					await provider.validateAuthorizationRequest({
						client,
						request: ctx.body.request,
						mode: ctx.body.mode,
					}),
				);
			},
		),
		testIssueAuthorizationCode: createAuthEndpoint(
			"/test/issue-authorization-code",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: z.object({
					request: z.record(z.string(), z.unknown()),
					authTime: z.number().optional(),
					amr: z.array(z.string()).optional(),
					referenceId: z.string().optional(),
				}),
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const { authTime, amr, referenceId } = ctx.body;
				const issued = await provider.issueAuthorizationCode({
					request: ctx.body.request as unknown as StoredAuthorizationQuery,
					session: ctx.context.session.session,
					authentication:
						authTime !== undefined || amr
							? {
									authTime:
										authTime !== undefined ? new Date(authTime) : undefined,
									amr,
								}
							: undefined,
					referenceId,
				});
				return ctx.json({
					code: issued.code,
					expiresAt: issued.expiresAt.getTime(),
				});
			},
		),
		// The canonical flow from the docs: authenticate the client, validate
		// its request, sign the user in, and return a code. The test signs in
		// with the existing session instead of checking credentials.
		testFirstPartySignIn: createAuthEndpoint(
			"/test/first-party-sign-in",
			{
				method: "POST",
				use: [sessionMiddleware],
				body: z.record(z.string(), z.unknown()),
				metadata: { noStore: true },
			},
			async (ctx) => {
				const provider = getOAuthProviderApi(
					ctx,
					ctx.context.getPlugin("oauth-provider")!.options,
				);
				const { client } = await provider.authenticateClient({
					requireCredentials: false,
				});
				const request = await provider.validateAuthorizationRequest({
					client,
					request: ctx.body,
					mode: "headless",
				});
				const { code } = await provider.issueAuthorizationCode({
					request,
					session: ctx.context.session.session,
					authentication: { amr: ["pwd"] },
				});
				return ctx.json({ code });
			},
		),
	},
} satisfies BetterAuthPlugin;

const authServerBaseUrl = "http://localhost:3000";
const tokenEndpoint = `${authServerBaseUrl}/api/auth/oauth2/token`;
const redirectUri = "https://rp.example.com/callback";
const resource = "https://api.example.com";
const codeExpiresIn = 120;

/** Stands in for a custom `storeTokens` hash, to show codes honor it. */
const hashToken = async (token: string, type: string) =>
	`${type}:${await storeToken("hashed", token, type)}`;

async function setup(
	options: {
		testWith?: "sqlite" | "postgres";
		oauth?: Partial<OAuthOptions<Scope[]>>;
		plugins?: BetterAuthPlugin[];
	} = {},
) {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseUrl,
			plugins: [
				codeIssuer,
				jwt({ jwt: { issuer: authServerBaseUrl } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					codeExpiresIn,
					storeTokens: { hash: hashToken },
					resources: [resource],
					enforcePerClientResources: false,
					...options.oauth,
				}),
				...(options.plugins ?? []),
			],
		} satisfies BetterAuthOptions,
		{ testWith: options.testWith ?? "sqlite" },
	);
	const { headers, user } = await signInWithTestUser();
	const context = await auth.$context;

	const createClient = (body: Record<string, unknown>) =>
		auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectUri],
				skip_consent: true,
				...body,
			},
		});

	async function pkce() {
		const verifier = generateRandomString(43);
		return { verifier, challenge: await generateCodeChallenge(verifier) };
	}

	/** OAuth error code of a failed `$fetch` result. */
	function errorOf(result: { error: unknown }) {
		return (result.error as { error?: string } | null)?.error;
	}

	function validate(
		oauthClient: OAuthClient,
		request: Record<string, unknown>,
		mode: "redirect" | "headless",
	) {
		return client.$fetch<StoredAuthorizationQuery>(
			"/test/validate-authorization-request",
			{
				method: "POST",
				body: { clientId: oauthClient.client_id, request, mode },
			},
		);
	}

	function issue(
		request: StoredAuthorizationQuery,
		extra: { authTime?: number; amr?: string[]; referenceId?: string } = {},
	) {
		return client.$fetch<{ code: string; expiresAt: number }>(
			"/test/issue-authorization-code",
			{ method: "POST", headers, body: { request, ...extra } },
		);
	}

	/**
	 * Validates `request`, stores the result as JSON as a plugin would between
	 * requests, then issues a code for it.
	 */
	async function validateAndIssue(
		oauthClient: OAuthClient,
		request: Record<string, unknown>,
		mode: "redirect" | "headless",
		extra?: { authTime?: number; amr?: string[]; referenceId?: string },
	) {
		const validated = await validate(oauthClient, request, mode);
		expect(validated.error).toBeNull();
		const stored = JSON.parse(JSON.stringify(validated.data));
		const issued = await issue(stored, extra);
		expect(issued.error).toBeNull();
		return issued.data!;
	}

	async function authorizeForCode(request: Record<string, string>) {
		let location = "";
		await client.$fetch(
			`/oauth2/authorize?${new URLSearchParams(request).toString()}`,
			{
				headers,
				onError(errorContext) {
					location = errorContext.response.headers.get("location") ?? "";
				},
			},
		);
		const code = new URL(location).searchParams.get("code");
		if (!code) throw new Error(`authorize did not return a code: ${location}`);
		return code;
	}

	function exchange(body: Record<string, string>, dpopProof?: string) {
		return client.$fetch<{
			access_token: string;
			id_token?: string;
			token_type: string;
		}>("/oauth2/token", {
			method: "POST",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				...(dpopProof ? { DPoP: dpopProof } : {}),
			},
			body: new URLSearchParams({
				grant_type: "authorization_code",
				...body,
			}),
		});
	}

	async function findCodeRow(code: string) {
		return context.internalAdapter.findVerificationValue(
			await hashToken(code, "authorization_code"),
		);
	}

	return {
		auth,
		client,
		context,
		headers,
		user,
		createClient,
		pkce,
		errorOf,
		validate,
		issue,
		validateAndIssue,
		authorizeForCode,
		exchange,
		findCodeRow,
	};
}

async function createDpopKey() {
	const { privateKey, publicKey } = await generateKeyPair("ES256", {
		extractable: true,
	});
	const publicJwk = await exportJWK(publicKey);
	return { privateKey, publicJwk, jkt: await deriveDpopJkt(publicJwk) };
}

function createTokenProof(key: Awaited<ReturnType<typeof createDpopKey>>) {
	return new SignJWT({
		jti: generateRandomString(16),
		htm: "POST",
		htu: tokenEndpoint,
		iat: Math.floor(Date.now() / 1000),
	})
		.setProtectedHeader({
			typ: "dpop+jwt",
			alg: "ES256",
			jwk: key.publicJwk as JWK,
		})
		.sign(key.privateKey);
}

/**
 * Codes are stored and redeemed through the database adapter, so these run
 * against SQLite and Postgres.
 *
 * @see https://github.com/better-auth/better-auth/issues/10414
 */
describe.each(["sqlite", "postgres"] as const)(
	"provider.issueAuthorizationCode redemption (%s)",
	async (testWith) => {
		const {
			user,
			createClient,
			pkce,
			errorOf,
			validateAndIssue,
			authorizeForCode,
			exchange,
			findCodeRow,
		} = await setup({ testWith });
		let confidentialClient: OAuthClient;
		let publicClient: OAuthClient;

		beforeAll(async () => {
			[confidentialClient, publicClient] = await Promise.all([
				createClient({ token_endpoint_auth_method: "client_secret_post" }),
				createClient({
					token_endpoint_auth_method: "none",
					application_type: "native",
				}),
			]);
		});

		/** A headless code for the public client, with its PKCE verifier. */
		async function headlessCode(extra: Record<string, unknown> = {}) {
			const { verifier, challenge } = await pkce();
			const issued = await validateAndIssue(
				publicClient,
				{
					client_id: publicClient.client_id,
					scope: "openid",
					code_challenge: challenge,
					code_challenge_method: "S256",
					...extra,
				},
				"headless",
			);
			return { code: issued.code, verifier };
		}

		it("stores the same code as /oauth2/authorize for the same request", async () => {
			const { challenge } = await pkce();
			const request = {
				response_type: "code",
				client_id: confidentialClient.client_id,
				redirect_uri: redirectUri,
				scope: "openid profile",
				state: "state-1",
				nonce: "nonce-1",
				resource,
				code_challenge: challenge,
				code_challenge_method: "S256",
			};
			const authorizeRow = await findCodeRow(await authorizeForCode(request));
			const issued = await validateAndIssue(
				confidentialClient,
				request,
				"redirect",
			);
			const issuedRow = await findCodeRow(issued.code);

			expect(issuedRow).not.toBeNull();
			expect(JSON.parse(issuedRow!.value)).toEqual(
				JSON.parse(authorizeRow!.value),
			);
			expect(JSON.parse(issuedRow!.value)).toMatchObject({
				type: "authorization_code",
				query: request,
				userId: user.id,
				resource: [resource],
			});
			expect(issued.expiresAt).toBe(issuedRow!.expiresAt.getTime());
			expect(
				issuedRow!.expiresAt.getTime() - issuedRow!.createdAt.getTime(),
			).toBe(codeExpiresIn * 1000);
		});

		it("binds a redirect code to its redirect_uri", async () => {
			const redeem = async (redirect: Record<string, string>) => {
				const { verifier, challenge } = await pkce();
				const issued = await validateAndIssue(
					confidentialClient,
					{
						response_type: "code",
						redirect_uri: redirectUri,
						scope: "openid",
						code_challenge: challenge,
						code_challenge_method: "S256",
					},
					"redirect",
				);
				return exchange({
					code: issued.code,
					code_verifier: verifier,
					client_id: confidentialClient.client_id,
					client_secret: confidentialClient.client_secret!,
					...redirect,
				});
			};

			expect(errorOf(await redeem({}))).toBe("invalid_request");
			const tokens = await redeem({ redirect_uri: redirectUri });
			expect(tokens.error).toBeNull();
		});

		it("redeems a headless code without redirect_uri, once", async () => {
			const { code, verifier } = await headlessCode({ resource });
			const body = {
				code,
				code_verifier: verifier,
				client_id: publicClient.client_id,
			};

			const tokens = await exchange(body);
			expect(tokens.error).toBeNull();
			expect(tokens.data?.id_token).toBeTypeOf("string");
			expect(decodeJwt(tokens.data!.access_token).aud).toContain(resource);
			expect(errorOf(await exchange(body))).toBe("invalid_grant");
		});

		it("rejects a redirect_uri when redeeming a headless code", async () => {
			const { code, verifier } = await headlessCode({
				redirect_uri: redirectUri,
				state: "dropped",
			});
			const tokens = await exchange({
				code,
				code_verifier: verifier,
				client_id: publicClient.client_id,
				redirect_uri: redirectUri,
			});

			expect(errorOf(tokens)).toBe("invalid_grant");
		});

		it("requires the PKCE verifier the request was bound to", async () => {
			const missing = await headlessCode();
			expect(
				errorOf(
					await exchange({
						code: missing.code,
						client_id: publicClient.client_id,
					}),
				),
			).toBe("invalid_request");

			const wrong = await headlessCode();
			expect(
				errorOf(
					await exchange({
						code: wrong.code,
						code_verifier: generateRandomString(43),
						client_id: publicClient.client_id,
					}),
				),
			).toBe("invalid_grant");
		});

		it("binds the code to dpop_jkt", async () => {
			const key = await createDpopKey();
			const otherKey = await createDpopKey();
			const redeem = async (proof?: string) => {
				const { code, verifier } = await headlessCode({
					dpop_jkt: key.jkt,
					resource,
				});
				return exchange(
					{ code, code_verifier: verifier, client_id: publicClient.client_id },
					proof,
				);
			};

			expect(errorOf(await redeem())).toBe("invalid_dpop_proof");
			expect(errorOf(await redeem(await createTokenProof(otherKey)))).toBe(
				"invalid_dpop_proof",
			);
			const tokens = await redeem(await createTokenProof(key));
			expect(tokens.error).toBeNull();
			expect(tokens.data?.token_type).toBe("DPoP");
			expect(decodeJwt(tokens.data!.access_token).cnf).toEqual({
				jkt: key.jkt,
			});
		});

		it("redeems a code once under concurrent requests", async () => {
			const { code, verifier } = await headlessCode();
			const body = {
				code,
				code_verifier: verifier,
				client_id: publicClient.client_id,
			};
			const results = await Promise.all([exchange(body), exchange(body)]);

			expect(results.filter((result) => result.error === null)).toHaveLength(1);
			expect(results.map(errorOf)).toContain("invalid_grant");
		});
	},
);

describe("provider.validateAuthorizationRequest", async () => {
	const {
		auth,
		client,
		createClient,
		headers,
		pkce,
		errorOf,
		validate,
		issue,
		findCodeRow,
	} = await setup({
		plugins: [oauthDeviceAuthorization({ verificationUri: "/device" })],
	});
	let confidentialClient: OAuthClient;
	let publicClient: OAuthClient;
	let machineClient: OAuthClient;
	let challenge: string;

	beforeAll(async () => {
		[confidentialClient, publicClient, machineClient] = await Promise.all([
			createClient({
				token_endpoint_auth_method: "client_secret_post",
				scope: "openid profile",
			}),
			createClient({
				token_endpoint_auth_method: "none",
				application_type: "native",
			}),
			createClient({
				grant_types: ["client_credentials"],
				redirect_uris: undefined,
			}),
		]);
		({ challenge } = await pkce());
	});

	it("returns a headless request: no redirect_uri or state, defaults applied", async () => {
		const result = await validate(
			confidentialClient,
			{
				redirect_uri: redirectUri,
				state: "state-1",
				code_challenge: challenge,
				code_challenge_method: "S256",
			},
			"headless",
		);

		expect(result.error).toBeNull();
		expect(result.data).toEqual({
			response_type: "code",
			client_id: confidentialClient.client_id,
			scope: "openid profile",
			code_challenge: challenge,
			code_challenge_method: "S256",
		});
	});

	it("issues a code from a plugin endpoint that authenticates the client", async () => {
		const signIn = (body: Record<string, unknown>) =>
			client.$fetch<{ code: string }>("/test/first-party-sign-in", {
				method: "POST",
				headers,
				body: {
					scope: "openid",
					code_challenge: challenge,
					code_challenge_method: "S256",
					...body,
				},
			});

		const publicCode = await signIn({ client_id: publicClient.client_id });
		expect(publicCode.error).toBeNull();
		const withoutSecret = await signIn({
			client_id: confidentialClient.client_id,
		});
		expect(errorOf(withoutSecret)).toBe("invalid_client");
		const confidentialCode = await signIn({
			client_id: confidentialClient.client_id,
			client_secret: confidentialClient.client_secret,
		});
		expect(confidentialCode.error).toBeNull();
		const row = await findCodeRow(confidentialCode.data!.code);
		expect(row!.value).not.toContain(confidentialClient.client_secret!);
	});

	it("removes client credentials from the request", async () => {
		const result = await validate(
			confidentialClient,
			{
				client_id: confidentialClient.client_id,
				client_secret: confidentialClient.client_secret,
				client_assertion: "eyJhbGciOiJub25lIn0.e30.",
				client_assertion_type:
					"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
				ui_locales: "en",
			},
			"headless",
		);

		expect(result.error).toBeNull();
		expect(result.data).toEqual({
			response_type: "code",
			client_id: confidentialClient.client_id,
			scope: "openid",
			code_challenge: challenge,
			code_challenge_method: "S256",
			ui_locales: "en",
		});
	});

	it("keeps redirect_uri and state in redirect mode", async () => {
		const request = {
			response_type: "code",
			redirect_uri: redirectUri,
			state: "state-1",
			scope: "openid",
			code_challenge: challenge,
			code_challenge_method: "S256",
		};
		const result = await validate(confidentialClient, request, "redirect");

		expect(result.error).toBeNull();
		expect(result.data).toEqual({
			...request,
			client_id: confidentialClient.client_id,
		});
	});

	it("requires redirect_uri and response_type in redirect mode", async () => {
		const request = {
			scope: "openid",
			code_challenge: challenge,
			code_challenge_method: "S256",
		};
		const withoutRedirect = await validate(
			confidentialClient,
			{ ...request, response_type: "code" },
			"redirect",
		);
		expect(errorOf(withoutRedirect)).toBe("invalid_request");
		const withoutResponseType = await validate(
			confidentialClient,
			{ ...request, redirect_uri: redirectUri },
			"redirect",
		);
		expect(errorOf(withoutResponseType)).toBe("invalid_request");
	});

	// Each check `/oauth2/authorize` makes also applies here, as an error
	// instead of a redirect.
	it.each([
		{
			name: "an unregistered redirect_uri",
			request: { redirect_uri: "https://attacker.example.com/callback" },
			error: "invalid_request",
			description: "invalid redirect uri",
		},
		{
			name: "an HTTP redirect_uri",
			request: { redirect_uri: "http://rp.example.com/callback" },
			error: "invalid_request",
			description:
				"Redirect URI must use HTTPS (HTTP allowed only for loopback hosts)",
		},
		{
			name: "an unsupported response_type",
			request: { response_type: "token" },
			error: "unsupported_response_type",
			description: "response_type must be one of: code",
		},
		{
			name: "a scope the client cannot request",
			request: { scope: "openid email" },
			error: "invalid_scope",
			description: "The following scopes are invalid: email",
		},
		{
			name: "an unsupported code_challenge_method",
			request: { code_challenge_method: "plain" },
			error: "invalid_request",
			description: "code_challenge_method must be one of: S256",
		},
		{
			name: "a code_challenge without its method when PKCE is required",
			request: { code_challenge_method: undefined },
			error: "invalid_request",
			description: "pkce is required for this client",
		},
		{
			name: "a malformed dpop_jkt",
			request: { dpop_jkt: "not-a-thumbprint" },
			error: "invalid_request",
			description:
				"dpop_jkt: dpop_jkt must be a base64url-encoded SHA-256 JWK thumbprint",
		},
		{
			name: "an unknown resource",
			request: { resource: "https://unknown.example.com" },
			error: "invalid_target",
			description:
				"requested resource https://unknown.example.com is not configured",
		},
		{
			name: "claims without the openid scope",
			request: { scope: "profile", claims: '{"userinfo":{"email":null}}' },
			error: "invalid_request",
			description:
				"openid scope must be requested when using the claims parameter",
		},
		{
			name: "a malformed claims request",
			request: { claims: "{not json" },
			error: "invalid_request",
			description: "claims must be a valid Claims request object",
		},
		{
			name: "an essential acr no supported value meets",
			request: {
				claims: JSON.stringify({
					id_token: { acr: { essential: true, value: "urn:example:mfa" } },
				}),
			},
			error: "access_denied",
			description: "essential acr requirement cannot be met",
		},
		{
			name: "a request object",
			request: { request: "eyJhbGciOiJub25lIn0.e30." },
			error: "request_not_supported",
			description: "request object not supported",
		},
		{
			name: "a request_uri",
			request: { request_uri: "urn:ietf:params:oauth:request_uri:abc" },
			error: "request_uri_not_supported",
			description: "request_uri not supported",
		},
		{
			name: "a response_mode",
			request: { response_mode: "query" },
			error: "invalid_request",
			description: "response_mode is not supported without a redirect",
		},
		{
			name: "an interaction request parameter",
			request: { user_code: "ABCD-EFGH" },
			error: "invalid_request",
			description: "user_code is not an authorization request parameter",
		},
		{
			name: "another client's client_id",
			request: { client_id: "another-client" },
			error: "invalid_request",
			description: "client_id does not match the client",
		},
	])("rejects $name", async ({ request, error, description }) => {
		const result = await validate(
			confidentialClient,
			{
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
				...request,
			},
			"headless",
		);

		expect(result.error).toMatchObject({
			status: 400,
			error,
			error_description: description,
		});
	});

	it("requires PKCE from a public client", async () => {
		const result = await validate(
			publicClient,
			{ scope: "openid" },
			"headless",
		);

		expect(errorOf(result)).toBe("invalid_request");
	});

	it("rejects a client without the authorization_code grant", async () => {
		const result = await validate(machineClient, {}, "headless");

		expect(errorOf(result)).toBe("unauthorized_client");
	});

	it("validates a stored request again when issuing its code", async () => {
		const oauthClient = await createClient({
			token_endpoint_auth_method: "client_secret_post",
		});
		const validated = await validate(
			oauthClient,
			{
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
			},
			"headless",
		);
		expect(validated.error).toBeNull();
		await auth.api.adminUpdateOAuthClient({
			headers,
			body: { client_id: oauthClient.client_id, update: { disabled: true } },
		});

		const issued = await issue(validated.data!);
		expect(issued.error?.status).toBe(400);
		expect(errorOf(issued)).toBe("invalid_client");
	});

	it("rejects an authentication time in the future", async () => {
		const validated = await validate(
			confidentialClient,
			{
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
			},
			"headless",
		);
		const issued = await issue(validated.data!, {
			authTime: Date.now() + 60_000,
		});

		expect(issued.error?.status).toBe(500);
		expect(errorOf(issued)).toBe("server_error");
	});
});

describe("provider.issueAuthorizationCode authentication context", async () => {
	const MFA = "urn:example:acr:mfa";
	const resolve = vi.fn(
		({ authentication }: { authentication?: { amr?: string[] } }) =>
			authentication?.amr?.includes("otp")
				? { acr: MFA, amr: authentication.amr }
				: { acr: "0" },
	);
	const {
		context,
		createClient,
		pkce,
		errorOf,
		validate,
		issue,
		exchange,
		findCodeRow,
	} = await setup({
		oauth: {
			authenticationContext: { acrValuesSupported: ["0", MFA], resolve },
		},
	});
	let publicClient: OAuthClient;

	beforeAll(async () => {
		publicClient = await createClient({
			token_endpoint_auth_method: "none",
			application_type: "native",
		});
	});

	async function headlessRequest(extra: Record<string, unknown> = {}) {
		const { verifier, challenge } = await pkce();
		const validated = await validate(
			publicClient,
			{
				scope: "openid",
				code_challenge: challenge,
				code_challenge_method: "S256",
				...extra,
			},
			"headless",
		);
		expect(validated.error).toBeNull();
		return { request: validated.data!, verifier };
	}

	it("passes what the caller observed to resolve, and issues its result", async () => {
		resolve.mockClear();
		const authTime = Date.now() - 5_000;
		const { request, verifier } = await headlessRequest();
		const issued = await issue(request, { authTime, amr: ["pwd", "otp"] });
		expect(issued.error).toBeNull();
		expect(resolve).toHaveBeenCalledOnce();
		expect(resolve.mock.calls[0]![0]).toMatchObject({
			authentication: { authTime: new Date(authTime), amr: ["pwd", "otp"] },
			requestedAcrValues: [],
			scopes: ["openid"],
		});

		const tokens = await exchange({
			code: issued.data!.code,
			code_verifier: verifier,
			client_id: publicClient.client_id,
		});
		expect(tokens.error).toBeNull();
		expect(decodeJwt(tokens.data!.id_token!)).toMatchObject({
			acr: MFA,
			amr: ["pwd", "otp"],
			auth_time: Math.floor(authTime / 1000),
		});
	});

	it("stores no code when the resolved acr misses an essential request", async () => {
		const { request } = await headlessRequest({
			claims: JSON.stringify({
				id_token: { acr: { essential: true, value: MFA } },
			}),
		});
		const before = await context.adapter.count({ model: "verification" });
		const issued = await issue(request, { amr: ["pwd"] });

		expect(errorOf(issued)).toBe("access_denied");
		expect(await context.adapter.count({ model: "verification" })).toBe(before);
		const satisfied = await issue(request, { amr: ["pwd", "otp"] });
		expect(satisfied.error).toBeNull();
		expect(await findCodeRow(satisfied.data!.code)).not.toBeNull();
	});
});
