import { APIError } from "better-auth/api";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { openAPI } from "better-auth/plugins";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { oauthDeviceAuthorizationClient, oauthProviderClient } from "./client";
import {
	DEVICE_CODE_GRANT_TYPE,
	oauthDeviceAuthorization,
} from "./device-code";
import { oauthProvider } from "./oauth";
import type { OAuthAuthenticationContext } from "./types";

const FORM_HEADERS = { "content-type": "application/x-www-form-urlencoded" };

interface TokenErrorBody {
	status?: number;
	error?: string;
	error_description?: string;
}

/** Accepts any instance's test client, whose types depend on its options. */
interface TestClient {
	$fetch: (path: never, options: never) => Promise<unknown>;
}

/** Sends a browser-style request and returns the URL the provider redirects to. */
async function fetchRedirect(
	client: TestClient,
	path: string,
	init: { headers: Headers; method?: "POST"; body?: Record<string, unknown> },
) {
	const fetchJSON = client.$fetch as (
		path: string,
		options: typeof init,
	) => Promise<{
		data: { url: string } | null;
		error: TokenErrorBody | null;
	}>;
	const headers = new Headers(init.headers);
	headers.set("accept", "application/json");
	const { data, error } = await fetchJSON(path, { ...init, headers });
	if (error || !data) throw error;
	return data.url;
}

/**
 * Opens `/oauth2/authorize?user_code=…` as a device verification page does and
 * returns the signed query of the page it redirects to.
 */
async function openDeviceConsent(
	client: TestClient,
	userCode: string,
	headers: Headers,
) {
	const url = await fetchRedirect(
		client,
		`/oauth2/authorize?user_code=${encodeURIComponent(userCode)}`,
		{ headers },
	);
	return new URL(url, "http://localhost").searchParams;
}

/** Answers a device's consent page and returns where the user is sent. */
async function answerDeviceConsent(
	client: TestClient,
	userCode: string,
	headers: Headers,
	answer: { accept: boolean; scope?: string } = { accept: true },
) {
	const consent = await openDeviceConsent(client, userCode, headers);
	return fetchRedirect(client, "/oauth2/consent", {
		method: "POST",
		headers,
		body: { ...answer, oauth_query: consent.toString() },
	});
}

describe("oauth-provider device-code composition", () => {
	it("registers Device Authorization and its OAuth grant from one plugin", async () => {
		const baseURL = "http://localhost:3000";
		const { auth } = await getTestInstance({
			baseURL,
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
				oauthDeviceAuthorization(),
			],
		});

		const metadata = (await auth.api.getOAuthServerConfig()) as unknown as {
			device_authorization_endpoint?: string;
			grant_types_supported?: string[];
		};
		expect(metadata.device_authorization_endpoint).toBe(
			`${baseURL}/api/auth/device/code`,
		);
		expect(metadata.grant_types_supported).toContain(DEVICE_CODE_GRANT_TYPE);
	});

	it("explains when OAuth Provider is missing", async () => {
		await expect(
			getTestInstance({ plugins: [oauthDeviceAuthorization()] }),
		).rejects.toMatchObject({
			message: "oauthDeviceAuthorization() requires oauthProvider() or mcp().",
		});
	});

	it("rejects a second Device Authorization plugin", async () => {
		await expect(
			getTestInstance({
				plugins: [
					jwt(),
					deviceAuthorization(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
					}),
					oauthDeviceAuthorization(),
				],
			}),
		).rejects.toMatchObject({
			message:
				"oauthDeviceAuthorization() cannot be combined with another Device Authorization plugin.",
		});
	});

	it("composes before OAuth Provider in the plugin list", async () => {
		const baseURL = "http://localhost:3001";
		const { auth } = await getTestInstance({
			baseURL,
			plugins: [
				jwt(),
				oauthDeviceAuthorization(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
			],
		});

		const metadata = (await auth.api.getOAuthServerConfig()) as unknown as {
			grant_types_supported?: string[];
		};
		expect(metadata.grant_types_supported).toContain(DEVICE_CODE_GRANT_TYPE);
	});

	it("exposes OAuth contracts only in composed installations", async () => {
		const standaloneClient = createAuthClient({
			plugins: [deviceAuthorizationClient()],
		});
		const composedClient = createAuthClient({
			plugins: [oauthDeviceAuthorizationClient()],
		});
		type StandaloneDeviceCodeInput = Parameters<
			typeof standaloneClient.device.code
		>[0];
		type ComposedDeviceCodeInput = Parameters<
			typeof composedClient.device.code
		>[0];
		expectTypeOf<StandaloneDeviceCodeInput>().not.toHaveProperty("resource");
		expectTypeOf<StandaloneDeviceCodeInput>().not.toHaveProperty(
			"client_secret",
		);
		expectTypeOf<StandaloneDeviceCodeInput>().not.toHaveProperty(
			"client_assertion",
		);
		expectTypeOf<StandaloneDeviceCodeInput>().not.toHaveProperty(
			"client_assertion_type",
		);
		expectTypeOf<ComposedDeviceCodeInput>()
			.toHaveProperty("resource")
			.toEqualTypeOf<string | string[] | undefined>();
		expectTypeOf<ComposedDeviceCodeInput>()
			.toHaveProperty("client_secret")
			.toEqualTypeOf<string | undefined>();
		expectTypeOf<ComposedDeviceCodeInput>()
			.toHaveProperty("client_assertion")
			.toEqualTypeOf<string | undefined>();
		expectTypeOf<ComposedDeviceCodeInput>()
			.toHaveProperty("client_assertion_type")
			.toEqualTypeOf<string | undefined>();

		const { auth: standaloneAuth } = await getTestInstance({
			plugins: [deviceAuthorization(), openAPI()],
		});
		const { auth: composedAuth } = await getTestInstance({
			plugins: [
				jwt(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
				oauthDeviceAuthorization(),
				openAPI(),
			],
		});
		type RequestProperties = Record<string, Record<string, unknown>>;
		type OpenAPIDocument = {
			paths: Record<
				string,
				{
					post?: {
						requestBody?: {
							content?: Record<
								string,
								{ schema?: { properties?: RequestProperties } }
							>;
						};
						responses?: Record<
							string,
							{
								headers?: Record<string, unknown>;
								content?: Record<
									string,
									{ schema?: { properties?: RequestProperties } }
								>;
							}
						>;
					};
				}
			>;
		};
		const getDeviceCodeOperation = (document: unknown) =>
			(document as OpenAPIDocument).paths["/device/code"]?.post;
		const getRequestProperties = (document: unknown) =>
			getDeviceCodeOperation(document)?.requestBody?.content?.[
				"application/json"
			]?.schema?.properties ?? {};
		const getUnauthorizedResponse = (document: unknown) =>
			getDeviceCodeOperation(document)?.responses?.["401"];
		const standaloneDocument = await standaloneAuth.api.generateOpenAPISchema();
		const composedDocument = await composedAuth.api.generateOpenAPISchema();

		expect(getRequestProperties(standaloneDocument)).not.toHaveProperty(
			"resource",
		);
		expect(getRequestProperties(standaloneDocument)).not.toHaveProperty(
			"client_secret",
		);
		expect(getRequestProperties(standaloneDocument)).not.toHaveProperty(
			"client_assertion",
		);
		expect(getRequestProperties(standaloneDocument)).not.toHaveProperty(
			"client_assertion_type",
		);
		expect(getRequestProperties(composedDocument)).toHaveProperty("resource");
		expect(getRequestProperties(composedDocument)).toHaveProperty(
			"client_secret",
		);
		expect(getRequestProperties(composedDocument)).toHaveProperty(
			"client_assertion",
		);
		expect(getRequestProperties(composedDocument)).toHaveProperty(
			"client_assertion_type",
		);
		expect(
			getUnauthorizedResponse(standaloneDocument)?.headers ?? {},
		).not.toHaveProperty("WWW-Authenticate");
		expect(getUnauthorizedResponse(composedDocument)).toMatchObject({
			headers: {
				"WWW-Authenticate": {
					schema: { type: "string", example: "Basic" },
				},
			},
			content: {
				"application/json": {
					schema: {
						properties: {
							error: { enum: ["invalid_client"] },
						},
					},
				},
			},
		});
	});
});

describe("oauth-provider device-code grant", async () => {
	const baseURL = "http://localhost:3000";
	const resource = "https://api.example.com";
	const secondResource = "https://files.example.com";
	const onDeviceAuthRequest = vi.fn();

	const { auth, client, db, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource, secondResource],
					enforcePerClientResources: false,
					allowDynamicClientRegistration: true,
					scopes: ["openid", "profile", "email", "offline_access"],
				}),
				oauthDeviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
					onDeviceAuthRequest,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [oauthProviderClient()],
			},
		},
	);

	const { user } = await signInWithTestUser();

	it("adds OAuth fields only when the device grant is composed", () => {
		const standaloneFields = deviceAuthorization().schema.deviceCode?.fields;
		const oauthDevicePlugin = oauthDeviceAuthorization();
		const oauthFields = oauthDevicePlugin.schema.deviceCode?.fields;

		expect(standaloneFields).not.toHaveProperty("resource");
		expect(standaloneFields).not.toHaveProperty("resources");
		expect(standaloneFields).not.toHaveProperty("oauthClientId");
		expect(oauthFields).toHaveProperty("resources");
		expect(oauthFields).toHaveProperty("oauthClientId");
		expect(
			oauthDevicePlugin.endpoints.deviceCode.options.error.safeParse({
				error: "invalid_target",
				error_description: "Unsupported resource",
			}).success,
		).toBe(true);
	});

	/** Registers a public OAuth client able to use the device-code grant. */
	async function createDeviceClient(
		grantTypes: string[] = [DEVICE_CODE_GRANT_TYPE],
		scope = "openid profile email",
	) {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: grantTypes,
				scope,
				application_type: "native",
			},
		});
		return created!.client_id;
	}

	/** Drives the device authorization request and user approval, returning the device code. */
	async function approvedDeviceCode(
		clientId: string,
		scope = "openid profile email",
		requestedResource?: string | string[],
	) {
		const { headers } = await signInWithTestUser();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope, resource: requestedResource },
		});
		if (requestedResource !== undefined) {
			const consent = await openDeviceConsent(client, user_code, headers);
			expect(consent.getAll("resource")).toEqual([requestedResource].flat());
		}
		await answerDeviceConsent(client, user_code, headers);
		return device_code;
	}

	function pollToken(body: Record<string, string>) {
		return client.$fetch<Record<string, unknown>>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams(body),
			headers: FORM_HEADERS,
		});
	}

	it("accepts a confidential client authenticated with Basic without body client_id", async () => {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://client.example.com/callback"],
			},
		});
		if (!created?.client_id || !created.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({ scope: "openid" }),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${created.client_id}:${created.client_secret}`).toString("base64")}`,
				},
			},
		);

		expect(response.error).toBeNull();
		expect(response.data?.device_code).toEqual(expect.any(String));
		expect(response.data?.user_code).toEqual(expect.any(String));
		const consent = await openDeviceConsent(
			client,
			response.data?.user_code as string,
			headers,
		);
		expect(consent.get("client_id")).toBe(created.client_id);
	});

	it("accepts a confidential client authenticated with client_secret_post", async () => {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://post.example.com/callback"],
			},
		});
		if (!created?.client_id || !created.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({
					client_id: created.client_id,
					client_secret: created.client_secret,
					scope: "openid",
				}),
				headers: FORM_HEADERS,
			},
		);

		expect(response.error).toBeNull();
		expect(response.data?.device_code).toEqual(expect.any(String));
		expect(response.data?.user_code).toEqual(expect.any(String));
		const consent = await openDeviceConsent(
			client,
			response.data?.user_code as string,
			headers,
		);
		expect(consent.get("client_id")).toBe(created.client_id);
	});

	it("accepts client_secret_post through the in-process API contract", async () => {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://post-api.example.com/callback"],
			},
		});
		if (!created?.client_id || !created.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const response = await auth.api.deviceCode({
			body: {
				client_id: created.client_id,
				client_secret: created.client_secret,
				scope: "openid",
			},
		});

		expect(response.device_code).toEqual(expect.any(String));
		expect(response.user_code).toEqual(expect.any(String));
	});

	it("authenticates an assertion whose client ID is supplied intrinsically", async () => {
		const assertionMethod = "https://example.com/device-assertion";
		const assertionValue = "valid-device-assertion";
		const assertionClientId = "intrinsic-assertion-client";
		const {
			auth: assertionAuth,
			client: assertionClient,
			signInWithTestUser: signInWithAssertionUser,
		} = await getTestInstance(
			{
				baseURL,
				plugins: [
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						extensions: [
							{
								clientAuthentication: {
									[assertionMethod]: {
										assertionTypes: [assertionMethod],
										authenticate: ({ assertion }) => {
											if (assertion !== assertionValue) {
												throw new Error("invalid assertion");
											}
											return { clientId: assertionClientId };
										},
									},
								},
							},
						],
						generateClientId: () => assertionClientId,
						scopes: ["openid"],
					}),
					oauthDeviceAuthorization(),
				],
			},
			{
				clientOptions: { plugins: [oauthProviderClient()] },
			},
		);
		const { headers } = await signInWithAssertionUser();
		const created = await assertionAuth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: assertionMethod,
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "native",
			},
		});
		expect(created?.client_id).toBe(assertionClientId);

		const response = await assertionClient.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({
					client_assertion_type: assertionMethod,
					client_assertion: assertionValue,
					scope: "openid",
				}),
				headers: FORM_HEADERS,
			},
		);

		expect(response.error).toBeNull();
		const consent = await openDeviceConsent(
			assertionClient,
			response.data?.user_code as string,
			headers,
		);
		expect(consent.get("client_id")).toBe(assertionClientId);
	});

	it("rejects multiple client authentication methods and repeated authentication parameters", async () => {
		const { headers } = await signInWithTestUser();
		const confidentialClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: ["client_credentials", DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://cardinality.example.com/callback"],
			},
		});
		if (!confidentialClient?.client_id || !confidentialClient.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const tokenResponse = await client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: "client_credentials",
					client_id: confidentialClient.client_id,
					client_secret: confidentialClient.client_secret,
					scope: "openid",
				}),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${confidentialClient.client_id}:${confidentialClient.client_secret}`).toString("base64")}`,
				},
			},
		);
		expect(tokenResponse.error?.status).toBe(400);
		expect((tokenResponse.error as TokenErrorBody)?.error).toBe(
			"invalid_request",
		);

		const deviceResponse = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({
					client_id: confidentialClient.client_id,
					client_secret: confidentialClient.client_secret,
					scope: "openid",
				}),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${confidentialClient.client_id}:${confidentialClient.client_secret}`).toString("base64")}`,
				},
			},
		);
		expect(deviceResponse.error?.status).toBe(400);
		expect((deviceResponse.error as TokenErrorBody)?.error).toBe(
			"invalid_request",
		);

		const unsupportedHeaderResponse = await client.$fetch<
			Record<string, unknown>
		>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: "client_credentials",
				client_id: confidentialClient.client_id,
				client_secret: confidentialClient.client_secret,
				scope: "openid",
			}),
			headers: {
				...FORM_HEADERS,
				authorization: "Bearer unsupported",
			},
		});
		expect(unsupportedHeaderResponse.error?.status).toBe(400);
		expect((unsupportedHeaderResponse.error as TokenErrorBody)?.error).toBe(
			"invalid_request",
		);

		const emptyBasicResponse = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams([
					["client_id", confidentialClient.client_id],
					["client_secret", ""],
					["scope", "openid"],
				]),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${confidentialClient.client_id}:${confidentialClient.client_secret}`).toString("base64")}`,
				},
			},
		);
		expect(emptyBasicResponse.error).toBeNull();
		expect(emptyBasicResponse.data?.device_code).toEqual(expect.any(String));

		const postClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_post",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://cardinality-post.example.com/callback"],
			},
		});
		if (!postClient?.client_id || !postClient.client_secret) {
			throw new Error("post OAuth client was not created");
		}
		const oneEffectiveSecretForm = new URLSearchParams([
			["client_id", postClient.client_id],
			["client_secret", ""],
			["client_secret", postClient.client_secret],
			["scope", "openid"],
		]);
		const oneEffectiveSecretResponse = await client.$fetch<
			Record<string, unknown>
		>("/device/code", {
			method: "POST",
			body: oneEffectiveSecretForm,
			headers: FORM_HEADERS,
		});
		expect(oneEffectiveSecretResponse.error).toBeNull();
		expect(oneEffectiveSecretResponse.data?.device_code).toEqual(
			expect.any(String),
		);

		const publicClientId = await createDeviceClient();
		let unsupportedHeaderChallenge: string | null = null;
		const unsupportedHeaderPublicResponse = await client.$fetch<
			Record<string, unknown>
		>("/device/code", {
			method: "POST",
			body: new URLSearchParams({
				client_id: publicClientId,
				scope: "openid",
			}),
			headers: {
				...FORM_HEADERS,
				authorization: "Bearer unsupported",
			},
			onError: ({ response }) => {
				unsupportedHeaderChallenge = response.headers.get("www-authenticate");
			},
		});
		expect(unsupportedHeaderPublicResponse.error?.status).toBe(401);
		expect(
			(unsupportedHeaderPublicResponse.error as TokenErrorBody)?.error,
		).toBe("invalid_client");
		expect(unsupportedHeaderChallenge).toBe("Bearer");

		for (const field of [
			"client_secret",
			"client_assertion",
			"client_assertion_type",
		] as const) {
			const response = await client.$fetch<Record<string, unknown>>(
				"/device/code",
				{
					method: "POST",
					body: {
						client_id: publicClientId,
						scope: "openid",
						[field]: 42,
					},
					headers: { "content-type": "application/json" },
				},
			);

			expect(response.error?.status).toBe(400);
			expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
		}

		for (const field of [
			"client_secret",
			"client_assertion",
			"client_assertion_type",
		] as const) {
			const form = new URLSearchParams([
				["client_id", publicClientId],
				["scope", "openid"],
				[field, "first"],
				[field, "second"],
			]);
			const response = await client.$fetch<Record<string, unknown>>(
				"/device/code",
				{
					method: "POST",
					body: form,
					headers: FORM_HEADERS,
				},
			);

			expect(response.error?.status).toBe(400);
			expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
		}

		const repeatedResourceForm = new URLSearchParams([
			["client_id", publicClientId],
			["scope", "openid"],
			["resource", resource],
			["resource", secondResource],
		]);
		const repeatedResourceResponse = await client.$fetch<
			Record<string, unknown>
		>("/device/code", {
			method: "POST",
			body: repeatedResourceForm,
			headers: FORM_HEADERS,
		});
		expect(repeatedResourceResponse.error).toBeNull();
		expect(repeatedResourceResponse.data?.device_code).toEqual(
			expect.any(String),
		);
	});

	it("rejects an unknown client in composed mode without explicit standalone validation", async () => {
		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({
					client_id: "unknown-composed-client",
					scope: "openid",
				}),
				headers: FORM_HEADERS,
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_client");
	});

	it("returns an RFC invalid_request envelope for duplicate base parameters", async () => {
		const form = new URLSearchParams([
			["client_id", "duplicate-parameter-client"],
			["scope", "openid"],
			["scope", "email"],
		]);
		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: form,
				headers: FORM_HEADERS,
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
		expect((response.error as TokenErrorBody)?.error_description).toMatch(
			/scope/,
		);
	});

	it("returns an RFC invalid_request envelope for malformed base parameters", async () => {
		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: { client_id: ["malformed-client"], scope: "openid" },
				headers: { "content-type": "application/json" },
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
		expect((response.error as TokenErrorBody)?.error_description).toMatch(
			/client_id/,
		);
	});

	it("returns invalid_request when an unauthenticated request omits client_id", async () => {
		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({ scope: "openid" }),
				headers: FORM_HEADERS,
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
		expect((response.error as TokenErrorBody)?.error_description).toMatch(
			/client_id/,
		);
	});

	it("returns invalid_client when Basic auth and body client_id identify different clients", async () => {
		const { headers } = await signInWithTestUser();
		const authenticatedClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://authenticated.example.com/callback"],
			},
		});
		if (!authenticatedClient?.client_id || !authenticatedClient.client_secret) {
			throw new Error("authenticated OAuth client was not created");
		}
		const bodyClient = await createDeviceClient();

		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({ client_id: bodyClient, scope: "openid" }),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${authenticatedClient.client_id}:${authenticatedClient.client_secret}`).toString("base64")}`,
				},
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_client");
	});

	it("treats an empty body client_id as omitted for authenticated requests", async () => {
		const validateClient = vi.fn(() => false);
		const {
			auth: validatedAuth,
			client: validatedClient,
			signInWithTestUser: signInWithValidatedUser,
		} = await getTestInstance(
			{
				baseURL,
				plugins: [
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						scopes: ["openid"],
					}),
					oauthDeviceAuthorization({ validateClient }),
				],
			},
			{
				clientOptions: { plugins: [oauthProviderClient()] },
			},
		);
		const { headers } = await signInWithValidatedUser();
		const created = await validatedAuth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://empty-id.example.com/callback"],
			},
		});
		if (!created?.client_id || !created.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const response = await validatedClient.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams([
					["client_id", ""],
					["client_id", created.client_id],
					["scope", "openid"],
				]),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${created.client_id}:${created.client_secret}`).toString("base64")}`,
				},
			},
		);

		expect(response.error).toBeNull();
		expect(response.data?.device_code).toEqual(expect.any(String));
		expect(validateClient).not.toHaveBeenCalled();
	});

	it("does not route an authenticated unknown body client through standalone validation", async () => {
		const validateClient = vi.fn(() => true);
		const {
			auth: validatedAuth,
			client: validatedClient,
			signInWithTestUser: signInWithValidatedUser,
		} = await getTestInstance(
			{
				baseURL,
				plugins: [
					jwt({ jwt: { issuer: baseURL } }),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						scopes: ["openid"],
					}),
					oauthDeviceAuthorization({ validateClient }),
				],
			},
			{
				clientOptions: { plugins: [oauthProviderClient()] },
			},
		);
		const { headers } = await signInWithValidatedUser();
		const created = await validatedAuth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
				redirect_uris: ["https://unknown-id.example.com/callback"],
			},
		});
		if (!created?.client_id || !created.client_secret) {
			throw new Error("confidential OAuth client was not created");
		}

		const response = await validatedClient.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: new URLSearchParams({
					client_id: "unknown-standalone-id",
					scope: "openid",
				}),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${created.client_id}:${created.client_secret}`).toString("base64")}`,
				},
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_client");
		expect(validateClient).not.toHaveBeenCalled();
	});

	it("advertises device_authorization_endpoint in discovery metadata", async () => {
		const authServer =
			(await auth.api.getOAuthServerConfig()) as unknown as Record<
				string,
				unknown
			>;
		// Derive from token_endpoint so the assertion is agnostic to basePath.
		const expectedEndpoint = String(authServer.token_endpoint).replace(
			"/oauth2/token",
			"/device/code",
		);
		expect(authServer.device_authorization_endpoint).toBe(expectedEndpoint);

		const openid = (await auth.api.getOpenIdConfig()) as unknown as Record<
			string,
			unknown
		>;
		expect(openid.device_authorization_endpoint).toBe(expectedEndpoint);
	});

	it("advertises the device_code grant in supported grant types", async () => {
		const authServer = (await auth.api.getOAuthServerConfig()) as unknown as {
			grant_types_supported?: string[];
		};
		expect(authServer.grant_types_supported).toContain(DEVICE_CODE_GRANT_TYPE);
	});

	it("issues a real OAuth token for an approved device code", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId, undefined, resource);

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
			resource,
		});

		expect(res.error).toBeNull();
		expect(res.data?.token_type).toBe("Bearer");
		expect(res.data?.scope).toBe("openid profile email");

		// A resource was requested, so the access token is a signed JWT bound to it
		// (RFC 9068): a real OAuth token, not a Better Auth session token.
		const accessToken = decodeJwt(res.data!.access_token as string);
		expect(accessToken.sub).toBe(user.id);
		expect(accessToken.client_id).toBe(clientId);
		expect(accessToken.aud).toContain(resource);
		expect((accessToken.scope as string).split(" ")).toContain("openid");

		// openid scope -> an ID token bound to the same subject.
		const idToken = decodeJwt(res.data!.id_token as string);
		expect(idToken.sub).toBe(user.id);
		expect(idToken.aud).toBe(clientId);
	});

	it("returns invalid_request when device-code polling omits client_id", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);

		const response = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
		});

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_request");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10752#pullrequestreview-4910497732
	 */
	it("treats empty token client ID occurrences as omitted regardless of order", async () => {
		const clientId = await createDeviceClient();
		for (const clientIdValues of [
			["", clientId],
			[clientId, ""],
		]) {
			const deviceCode = await approvedDeviceCode(clientId);
			const response = await client.$fetch<Record<string, unknown>>(
				"/oauth2/token",
				{
					method: "POST",
					body: new URLSearchParams([
						["grant_type", DEVICE_CODE_GRANT_TYPE],
						["device_code", deviceCode],
						...clientIdValues.map((clientIdValue) => [
							"client_id",
							clientIdValue,
						]),
					]),
					headers: FORM_HEADERS,
				},
			);

			expect(response.error).toBeNull();
			expect(response.data?.access_token).toEqual(expect.any(String));
		}
	});

	it("returns an HTTP Basic challenge when client authentication fails", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);
		let responseHeaders: Headers | undefined;

		const response = await client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code: deviceCode,
				}),
				headers: {
					...FORM_HEADERS,
					authorization: `Basic ${Buffer.from(`${clientId}:wrong-secret`).toString("base64")}`,
				},
				onError(context) {
					responseHeaders = context.response.headers;
				},
			},
		);

		expect(response.error?.status).toBe(401);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_client");
		expect(responseHeaders?.get("WWW-Authenticate")).toBe("Basic");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10135
	 */
	it("normalizes whitespace in approved scopes", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(
			clientId,
			"  openid\tprofile  email  ",
			resource,
		);

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
			resource,
		});

		expect(res.error).toBeNull();
		expect(res.data?.scope).toBe("openid profile email");
		const accessToken = decodeJwt(res.data!.access_token as string);
		expect(accessToken.scope).toBe("openid profile email");
	});

	it("rejects resources outside the provider policy", async () => {
		const clientId = await createDeviceClient();
		onDeviceAuthRequest.mockClear();

		await expect(
			auth.api.deviceCode({
				body: {
					client_id: clientId,
					scope: "openid",
					resource: "https://unregistered.example.com",
				},
			}),
		).rejects.toMatchObject({
			body: { error: "invalid_target" },
		});
		expect(onDeviceAuthRequest).not.toHaveBeenCalled();
	});

	it("treats an empty form resource as omitted within the OAuth flow", async () => {
		const clientId = await createDeviceClient();
		const form = new URLSearchParams({
			client_id: clientId,
			scope: "openid",
			resource: "",
		});
		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: form,
				headers: FORM_HEADERS,
			},
		);

		expect(response.error).toBeNull();
		const { headers } = await signInWithTestUser();
		const userCode = response.data!.user_code as string;
		const consent = await openDeviceConsent(client, userCode, headers);
		expect(consent.getAll("resource")).toEqual([]);
		await answerDeviceConsent(client, userCode, headers);

		const token = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: response.data!.device_code as string,
			client_id: clientId,
		});
		expect(token.error).toBeNull();
	});

	it("keeps base validation when resource and client_id are both invalid", async () => {
		const response = await auth.handler(
			new Request(`${baseURL}/api/auth/device/code`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ client_id: 42, resource: "/api" }),
			}),
		);

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error?: string };
		expect(body.error).toBe("invalid_request");
	});

	it.each([
		["malformed", "https://[invalid"],
		["relative", "/api"],
		["fragmented", `${resource}#fragment`],
		["dangerous-scheme", "javascript:alert(1)"],
		["wrong-type", 42],
		["array-item", [resource, "/api"]],
	])(
		"returns invalid_target for %s RFC 8707 resource indicators at the HTTP boundary",
		async (_label, invalidResource) => {
			const clientId = await createDeviceClient();
			const response = await client.$fetch<Record<string, unknown>>(
				"/device/code",
				{
					method: "POST",
					body: { client_id: clientId, resource: invalidResource },
				},
			);

			expect(response.error?.status).toBe(400);
			expect((response.error as TokenErrorBody)?.error).toBe("invalid_target");
		},
	);

	it("binds repeated form-encoded resources at the device endpoint", async () => {
		const clientId = await createDeviceClient();
		const form = new URLSearchParams({
			client_id: clientId,
			scope: "openid",
		});
		form.append("resource", resource);
		form.append("resource", secondResource);

		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: form,
				headers: FORM_HEADERS,
			},
		);
		expect(response.error).toBeNull();

		const { headers } = await signInWithTestUser();
		const consent = await openDeviceConsent(
			client,
			response.data!.user_code as string,
			headers,
		);
		expect(consent.getAll("resource")).toEqual([resource, secondResource]);
	});

	it("validates every repeated form-encoded resource", async () => {
		const clientId = await createDeviceClient();
		const form = new URLSearchParams({
			client_id: clientId,
			scope: "openid",
		});
		form.append("resource", "/relative");
		form.append("resource", resource);

		const response = await client.$fetch<Record<string, unknown>>(
			"/device/code",
			{
				method: "POST",
				body: form,
				headers: FORM_HEADERS,
			},
		);

		expect(response.error?.status).toBe(400);
		expect((response.error as TokenErrorBody)?.error).toBe("invalid_target");
		expect((response.error as TokenErrorBody)?.error_description).toBe(
			"Invalid resource indicator",
		);
	});

	it("rejects a resource added after approval without consuming the code", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId, "openid");

		const widened = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
			resource,
		});
		expect(widened.error?.status).toBe(400);
		expect((widened.error as TokenErrorBody)?.error).toBe("invalid_target");

		const stored = await db.findOne<{ deviceCode: string }>({
			model: "deviceCode",
			where: [{ field: "deviceCode", value: deviceCode }],
		});
		expect(stored?.deviceCode).toBe(deviceCode);
	});

	it("keeps every approved resource refreshable after a narrowed exchange", async () => {
		const scope = "openid offline_access";
		const clientId = await createDeviceClient(
			[DEVICE_CODE_GRANT_TYPE, "refresh_token"],
			scope,
		);
		const deviceCode = await approvedDeviceCode(clientId, scope, [
			resource,
			secondResource,
		]);

		const narrowed = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
			resource,
		});
		expect(narrowed.error).toBeNull();
		expect(decodeJwt(narrowed.data!.access_token as string).aud).not.toContain(
			secondResource,
		);

		const refreshed = await pollToken({
			grant_type: "refresh_token",
			refresh_token: narrowed.data!.refresh_token as string,
			client_id: clientId,
			resource: secondResource,
		});
		expect(refreshed.error).toBeNull();
		expect(decodeJwt(refreshed.data!.access_token as string).aud).toContain(
			secondResource,
		);
	});

	it("single-uses the device code (second exchange fails)", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);

		const first = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
		});
		expect(first.error).toBeNull();

		const second = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
		});
		expect(second.error?.status).toBe(400);
		expect((second.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10746#discussion_r3751447613
	 */
	it("preserves an approved code when user lookup fails before OAuth issuance", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);
		await db.update({
			model: "deviceCode",
			where: [{ field: "deviceCode", value: deviceCode }],
			update: { userId: "missing-user" },
		});

		const response = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: clientId,
		});

		expect(response.error?.status).toBe(500);
		expect((response.error as TokenErrorBody)?.error).toBe("server_error");
		const stored = await db.findOne<{ deviceCode: string }>({
			model: "deviceCode",
			where: [{ field: "deviceCode", value: deviceCode }],
		});
		expect(stored?.deviceCode).toBe(deviceCode);
	});

	it("returns authorization_pending before approval", async () => {
		const clientId = await createDeviceClient();
		const { device_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope: "openid" },
		});

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("authorization_pending");
	});

	it("returns slow_down when polling faster than the interval", async () => {
		const clientId = await createDeviceClient();
		const { device_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope: "openid" },
		});

		// First poll records lastPolledAt (still pending); the immediate second poll
		// is inside the 2s interval and must be told to slow down.
		await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("slow_down");
	});

	it("returns access_denied when the user denies the request", async () => {
		const clientId = await createDeviceClient();
		const { headers } = await signInWithTestUser();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope: "openid" },
		});
		await answerDeviceConsent(client, user_code, headers, { accept: false });

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("access_denied");
	});

	it("rejects an unknown device code", async () => {
		const clientId = await createDeviceClient();
		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: "does-not-exist",
			client_id: clientId,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11035
	 */
	it("returns invalid_client for an unknown client_id before looking up the device code", async () => {
		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: "does-not-exist",
			client_id: "unknown-client",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error).toMatchObject({
			error: "invalid_client",
			error_description: "client not found",
		});
	});

	it("rejects a device code presented by a different client", async () => {
		const clientId = await createDeviceClient();
		const otherClientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: otherClientId,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});

	it("returns invalid_grant (not invalid_scope) when a narrower-scoped client replays a code", async () => {
		// Victim code is created for a client with a broad scope set.
		const victimClientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(
			victimClientId,
			"openid profile email",
		);

		// Attacker client is registered for only `openid`. The ownership check must
		// fire before scope validation, so replaying the code can't reveal the
		// victim's requested scopes through an invalid_scope error.
		const { headers } = await signInWithTestUser();
		const attacker = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "native",
			},
		});

		const res = await pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: deviceCode,
			client_id: attacker!.client_id,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});

	it("does not reveal device-code scopes to a confidential client", async () => {
		const victimClientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(
			victimClientId,
			"openid profile email",
		);

		const { headers } = await signInWithTestUser();
		const attacker = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "client_secret_basic",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "web",
			},
		});

		const res = await client.$fetch<Record<string, unknown>>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code: deviceCode,
			}),
			headers: {
				...FORM_HEADERS,
				authorization: `Basic ${Buffer.from(
					`${attacker!.client_id}:${attacker!.client_secret}`,
				).toString("base64")}`,
			},
		});

		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});

	it("blocks redeeming an OAuth-client device code at the first-party /device/token", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);

		// /device/token accepts JSON (not form-encoded), unlike /oauth2/token.
		const res = await client.$fetch<Record<string, unknown>>("/device/token", {
			method: "POST",
			body: {
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code: deviceCode,
				client_id: clientId,
			},
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
		expect((res.error as TokenErrorBody)?.error_description).toContain(
			"/oauth2/token",
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10135
	 */
	it("keeps minted OAuth codes out of the session flow after client deletion", async () => {
		const clientId = await createDeviceClient();
		const deviceCode = await approvedDeviceCode(clientId);
		const context = await auth.$context;
		await context.adapter.delete({
			model: "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		});

		const res = await client.$fetch<Record<string, unknown>>("/device/token", {
			method: "POST",
			body: {
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code: deviceCode,
				client_id: clientId,
			},
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");

		const stored = await db.findOne<{ deviceCode: string }>({
			model: "deviceCode",
			where: [{ field: "deviceCode", value: deviceCode }],
		});
		expect(stored?.deviceCode).toBe(deviceCode);
	});

	it("still issues a first-party session token for a non-OAuth client at /device/token", async () => {
		const firstPartyClientId = "first-party-cli";
		const {
			auth: standaloneAuth,
			client: standaloneClient,
			signInWithTestUser: signInWithStandaloneUser,
		} = await getTestInstance(
			{ plugins: [deviceAuthorization()] },
			{ clientOptions: { plugins: [deviceAuthorizationClient()] } },
		);
		const { headers } = await signInWithStandaloneUser();
		const { device_code, user_code } = await standaloneAuth.api.deviceCode({
			body: { client_id: firstPartyClientId },
		});
		await standaloneAuth.api.deviceVerify({ query: { user_code }, headers });
		await standaloneAuth.api.deviceApprove({
			body: { userCode: user_code },
			headers,
		});

		const res = await standaloneClient.$fetch<Record<string, unknown>>(
			"/device/token",
			{
				method: "POST",
				body: {
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code,
					client_id: firstPartyClientId,
				},
			},
		);
		expect(res.error).toBeNull();
		expect(res.data?.access_token).toBeDefined();
		expect(res.data?.token_type).toBe("Bearer");
	});
});

describe("oauth-provider device-code immutable routing", async () => {
	const baseURL = "http://localhost:3007";
	const firstPartyClientId = "late-registered-oauth-client";
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				generateClientId: () => firstPartyClientId,
				scopes: ["openid"],
			}),
			oauthDeviceAuthorization({
				validateClient: (clientId) => clientId === firstPartyClientId,
			}),
		],
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10135
	 */
	it("keeps a standalone code in the session flow after its client id is registered", async () => {
		const { headers } = await signInWithTestUser();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: firstPartyClientId },
		});
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });

		const registered = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "native",
			},
		});
		expect(registered?.client_id).toBe(firstPartyClientId);

		const oauthExchange = await client.$fetch<Record<string, unknown>>(
			"/oauth2/token",
			{
				method: "POST",
				body: new URLSearchParams({
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code,
					client_id: firstPartyClientId,
				}),
				headers: FORM_HEADERS,
			},
		);
		expect(oauthExchange.error?.status).toBe(400);
		expect((oauthExchange.error as TokenErrorBody)?.error).toBe(
			"invalid_grant",
		);

		const sessionExchange = await client.$fetch<Record<string, unknown>>(
			"/device/token",
			{
				method: "POST",
				body: {
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code,
					client_id: firstPartyClientId,
				},
			},
		);
		expect(sessionExchange.error).toBeNull();
		expect(sessionExchange.data?.access_token).toBeDefined();
	});
});

describe("oauth-provider device-code grant expiry", async () => {
	const baseURL = "http://localhost:3000";
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					allowDynamicClientRegistration: true,
					scopes: ["openid", "profile", "email"],
				}),
				oauthDeviceAuthorization({
					expiresIn: "1s",
					interval: "1s",
				}),
			],
		},
		{ clientOptions: { plugins: [oauthProviderClient()] } },
	);

	it("returns expired_token once the device code has expired", async () => {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid",
				application_type: "native",
			},
		});
		const clientId = created!.client_id;
		const { device_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope: "openid" },
		});

		// Let the 1s device code lapse, then poll.
		await new Promise((resolve) => setTimeout(resolve, 1200));

		const res = await client.$fetch<Record<string, unknown>>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams({
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code,
				client_id: clientId,
			}),
			headers: FORM_HEADERS,
		});
		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("expired_token");
	});
});

describe("oauth-provider device-code grant reuse", async () => {
	const baseURL = "http://localhost:3000";
	const discoveredClientId = "discovered-device-client";
	const sharedOAuthDeviceAuthorization = oauthDeviceAuthorization();
	const first = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
				extensions: [
					{
						clientDiscovery: {
							id: "device-code-reuse-test",
							matches: (clientId) => clientId === discoveredClientId,
							resolve: (_ctx, clientId) => ({
								clientId,
								tokenEndpointAuthMethod: "none",
								grantTypes: [DEVICE_CODE_GRANT_TYPE],
								scopes: ["openid"],
							}),
						},
					},
				],
			}),
			sharedOAuthDeviceAuthorization,
		],
	});

	await getTestInstance({
		baseURL: "http://localhost:3001",
		plugins: [
			jwt({ jwt: { issuer: "http://localhost:3001" } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
			}),
			sharedOAuthDeviceAuthorization,
		],
	});

	it("keeps each auth instance bound to its own provider options", async () => {
		const { device_code } = await first.auth.api.deviceCode({
			body: { client_id: discoveredClientId, scope: "openid" },
		});

		const res = await first.client.$fetch<Record<string, unknown>>(
			"/device/token",
			{
				method: "POST",
				body: {
					grant_type: DEVICE_CODE_GRANT_TYPE,
					device_code,
					client_id: discoveredClientId,
				},
			},
		);

		expect(res.error?.status).toBe(400);
		expect((res.error as TokenErrorBody)?.error).toBe("invalid_grant");
	});
});

describe("oauth-provider device approval through the consent flow", async () => {
	const baseURL = "http://localhost:3000";
	const resource = "https://api.example.com";
	const referenceClaim = "https://example.com/reference";
	const firstPartyClientId = "first-party-cli";
	const requireReference = (): string => {
		throw new APIError("BAD_REQUEST", { error: "reference_required" });
	};
	let resolveReference: () => string | undefined = requireReference;
	let needsSelection = false;
	const consentReferenceId = vi.fn(() => resolveReference());
	const mfaAcr = "urn:example:acr:mfa";
	const resolveAuthenticationContext =
		vi.fn<() => OAuthAuthenticationContext | undefined>();
	const { auth, client, db, signInWithTestUser, signInWithUser } =
		await getTestInstance({
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource],
					enforcePerClientResources: false,
					scopes: ["openid", "offline_access"],
					postLogin: {
						page: "/select-organization",
						shouldRedirect: () => needsSelection,
						consentReferenceId,
					},
					customAccessTokenClaims: ({ referenceId }) => ({
						[referenceClaim]: referenceId,
					}),
					authenticationContext: {
						acrValuesSupported: ["0", mfaAcr],
						resolve: resolveAuthenticationContext,
					},
				}),
				oauthDeviceAuthorization({
					interval: "1s",
					validateClient: (clientId) => clientId === firstPartyClientId,
				}),
			],
		});

	async function startDevice(clientBody: Record<string, unknown> = {}) {
		const { headers, user } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				application_type: "native",
				grant_types: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
				scope: "openid offline_access",
				...clientBody,
			},
		});
		const clientId = created!.client_id;
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: clientId, scope: "openid offline_access", resource },
		});
		consentReferenceId.mockClear();
		const poll = (body: Record<string, string>) =>
			client.$fetch<{
				access_token: string;
				refresh_token?: string;
				id_token?: string;
				scope: string;
			}>("/oauth2/token", {
				method: "POST",
				body: new URLSearchParams({ client_id: clientId, resource, ...body }),
				headers: FORM_HEADERS,
			});
		return { clientId, device_code, user_code, headers, user, poll };
	}

	it("binds device tokens and their refreshes to the selected reference", async () => {
		resolveReference = () => "org_1";
		const { clientId, device_code, user_code, headers, user, poll } =
			await startDevice();

		const landing = await answerDeviceConsent(client, user_code, headers);
		expect(landing).toBe(
			`${baseURL}/device?user_code=${user_code}&status=approved`,
		);
		expect(consentReferenceId).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({ id: user.id }),
				scopes: ["openid", "offline_access"],
			}),
		);
		const consent = await db.findOne<{ referenceId?: string }>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: clientId },
				{ field: "userId", value: user.id },
			],
		});
		expect(consent?.referenceId).toBe("org_1");

		const tokens = await poll({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
		});
		expect(tokens.error).toBeNull();
		expect(decodeJwt(tokens.data!.access_token)[referenceClaim]).toBe("org_1");
		expect(decodeJwt(tokens.data!.id_token!).auth_time).toEqual(
			expect.any(Number),
		);

		resolveReference = () => "org_2";
		const refreshed = await poll({
			grant_type: "refresh_token",
			refresh_token: tokens.data!.refresh_token!,
		});
		expect(refreshed.error).toBeNull();
		expect(decodeJwt(refreshed.data!.access_token)[referenceClaim]).toBe(
			"org_1",
		);
	});

	it("carries the resolved acr and amr into device ID tokens and their refreshes", async () => {
		resolveReference = () => "org_1";
		resolveAuthenticationContext.mockReturnValueOnce({
			acr: mfaAcr,
			amr: ["pwd", "otp"],
		});
		const { device_code, user_code, headers, poll } = await startDevice();
		await answerDeviceConsent(client, user_code, headers);

		const tokens = await poll({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
		});
		expect(tokens.error).toBeNull();
		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(idToken.acr).toBe(mfaAcr);
		expect(idToken.amr).toEqual(["pwd", "otp"]);

		const refreshed = await poll({
			grant_type: "refresh_token",
			refresh_token: tokens.data!.refresh_token!,
		});
		expect(refreshed.error).toBeNull();
		const refreshedIdToken = decodeJwt(refreshed.data!.id_token!);
		expect(refreshedIdToken.acr).toBe(mfaAcr);
		expect(refreshedIdToken.amr).toEqual(["pwd", "otp"]);
	});

	it("runs post-login selection before consent", async () => {
		resolveReference = () => "org_1";
		needsSelection = true;
		try {
			const { user_code, headers } = await startDevice();
			const selection = await fetchRedirect(
				client,
				`/oauth2/authorize?user_code=${user_code}`,
				{ headers },
			);
			expect(new URL(selection, baseURL).pathname).toBe("/select-organization");

			needsSelection = false;
			const consentPage = await fetchRedirect(client, "/oauth2/continue", {
				method: "POST",
				headers,
				body: {
					postLogin: true,
					oauth_query: new URL(selection, baseURL).search.slice(1),
				},
			});
			expect(new URL(consentPage, baseURL).pathname).toBe("/consent");
		} finally {
			needsSelection = false;
		}
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-5.4
	 */
	it("shows consent for a skip-consent client that already has consent", async () => {
		resolveReference = () => "org_1";
		const first = await startDevice({ skip_consent: true });
		await answerDeviceConsent(client, first.user_code, first.headers);

		const { device_code, user_code } = await auth.api.deviceCode({
			body: {
				client_id: first.clientId,
				scope: "openid offline_access",
				resource,
			},
		});
		const consent = await fetchRedirect(
			client,
			`/oauth2/authorize?user_code=${user_code}`,
			{ headers: first.headers },
		);
		expect(new URL(consent, baseURL).pathname).toBe("/consent");
		expect(new URL(consent, baseURL).searchParams.get("user_code")).toBe(
			user_code,
		);
		const pending = await first.poll({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
		});
		expect((pending.error as TokenErrorBody | null)?.error).toBe(
			"authorization_pending",
		);
	});

	it("records no empty scope for a device code requested without scopes", async () => {
		resolveReference = () => "org_1";
		const { headers, user } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				application_type: "native",
				grant_types: [DEVICE_CODE_GRANT_TYPE],
				scope: "openid offline_access",
			},
		});
		const { user_code } = await auth.api.deviceCode({
			body: { client_id: created!.client_id, resource },
		});

		await answerDeviceConsent(client, user_code, headers);
		const stored = await db.findOne<{ scopes: string[] }>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: created!.client_id },
				{ field: "userId", value: user.id },
			],
		});
		expect(stored?.scopes).toEqual([]);
	});

	/**
	 * @see https://datatracker.ietf.org/doc/html/rfc8628#section-5.4
	 */
	it("does not let another user approve through a query signed after consent", async () => {
		resolveReference = () => "org_1";
		const attacker = await startDevice({ skip_consent: true });
		const consent = await openDeviceConsent(
			client,
			attacker.user_code,
			attacker.headers,
		);

		// Accepting from a second session whose post-login selection is pending
		// yields a selection page signed without the consent prompt.
		const { headers: secondSession } = await signInWithTestUser();
		needsSelection = true;
		let selection: URL;
		try {
			selection = new URL(
				await fetchRedirect(client, "/oauth2/consent", {
					method: "POST",
					headers: secondSession,
					body: { accept: true, oauth_query: consent.toString() },
				}),
				baseURL,
			);
		} finally {
			needsSelection = false;
		}
		expect(selection.pathname).toBe("/select-organization");

		await auth.api.signUpEmail({
			body: {
				email: "device-victim@example.com",
				password: "device-victim-password",
				name: "Victim",
			},
		});
		const { headers: victim } = await signInWithUser(
			"device-victim@example.com",
			"device-victim-password",
		);
		const next = await fetchRedirect(client, "/oauth2/continue", {
			method: "POST",
			headers: victim,
			body: { postLogin: true, oauth_query: selection.search.slice(1) },
		});
		expect(new URL(next, baseURL).pathname).toBe("/consent");
		const pending = await attacker.poll({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: attacker.device_code,
		});
		expect((pending.error as TokenErrorBody | null)?.error).toBe(
			"authorization_pending",
		);
	});

	it("signs a signed-out user in before revealing anything about the code", async () => {
		resolveReference = () => "org_1";
		const { user_code } = await startDevice();
		for (const code of [user_code, "NOT-A-CODE"]) {
			const login = new URL(
				await fetchRedirect(
					client,
					`/oauth2/authorize?user_code=${encodeURIComponent(code)}`,
					{ headers: new Headers() },
				),
				baseURL,
			);
			expect(login.pathname).toBe("/login");
			expect(login.searchParams.get("user_code")).toBe(code);
			expect(login.searchParams.has("client_id")).toBe(false);
		}

		// Signing in on that page resumes into the device's consent page.
		const login = new URL(
			await fetchRedirect(client, `/oauth2/authorize?user_code=${user_code}`, {
				headers: new Headers(),
			}),
			baseURL,
		);
		const consent = new URL(
			await fetchRedirect(client, "/sign-in/email", {
				method: "POST",
				headers: new Headers(),
				body: {
					email: "test@test.com",
					password: "test123456",
					oauth_query: login.search.slice(1),
				},
			}),
			baseURL,
		);
		expect(consent.pathname).toBe("/consent");
		expect(consent.searchParams.get("user_code")).toBe(user_code);
	});

	it("returns a deny on an already approved code to the device page", async () => {
		resolveReference = () => "org_1";
		const { user_code, headers } = await startDevice();
		const consent = await openDeviceConsent(client, user_code, headers);
		await fetchRedirect(client, "/oauth2/consent", {
			method: "POST",
			headers,
			body: { accept: true, oauth_query: consent.toString() },
		});

		const denied = await fetchRedirect(client, "/oauth2/consent", {
			method: "POST",
			headers,
			body: { accept: false, oauth_query: consent.toString() },
		});
		expect(new URL(denied).pathname).toBe("/device");
		expect(new URL(denied).searchParams.get("user_code")).toBe(user_code);
		expect(new URL(denied).searchParams.get("error")).toBe("invalid_request");
	});

	it("denies the device from the consent page", async () => {
		const { device_code, user_code, headers, poll } = await startDevice();

		const landing = await answerDeviceConsent(client, user_code, headers, {
			accept: false,
		});
		expect(landing).toBe(
			`${baseURL}/device?user_code=${user_code}&status=denied`,
		);
		const res = await poll({ grant_type: DEVICE_CODE_GRANT_TYPE, device_code });
		expect((res.error as TokenErrorBody | null)?.error).toBe("access_denied");
	});

	it("sends a device approval for a client disabled mid-flow to the verification page", async () => {
		resolveReference = () => "org_1";
		const { clientId, device_code, user_code, headers } = await startDevice();
		const consent = await openDeviceConsent(client, user_code, headers);
		await auth.api.adminUpdateOAuthClient({
			headers,
			body: { client_id: clientId, update: { disabled: true } },
		});

		const landing = new URL(
			await fetchRedirect(client, "/oauth2/consent", {
				method: "POST",
				headers,
				body: { accept: true, oauth_query: consent.toString() },
			}),
		);
		expect(landing.pathname).toBe("/device");
		expect(landing.searchParams.get("user_code")).toBe(user_code);
		expect(landing.searchParams.get("error")).toBe("client_disabled");
		const stored = await db.findOne<{ status: string }>({
			model: "deviceCode",
			where: [{ field: "deviceCode", value: device_code }],
		});
		expect(stored?.status).toBe("pending");
	});

	it("applies scopes narrowed on the consent page", async () => {
		resolveReference = () => "org_1";
		const { device_code, user_code, headers, poll } = await startDevice();

		await answerDeviceConsent(client, user_code, headers, {
			accept: true,
			scope: "openid",
		});
		const tokens = await poll({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
		});
		expect(tokens.data?.scope).toBe("openid");
		expect(tokens.data?.refresh_token).toBeUndefined();
	});

	it("leaves the code pending when the reference cannot be resolved", async () => {
		resolveReference = requireReference;
		const { device_code, user_code, headers, poll } = await startDevice();

		await expect(
			answerDeviceConsent(client, user_code, headers),
		).rejects.toMatchObject({ error: "reference_required" });
		const res = await poll({ grant_type: DEVICE_CODE_GRANT_TYPE, device_code });
		expect((res.error as TokenErrorBody | null)?.error).toBe(
			"authorization_pending",
		);
	});

	it("rejects an approval when the code expires before the final step", async () => {
		let calls = 0;
		resolveReference = () => {
			// The consent endpoint resolves the reference first; expire the code
			// before the second resolution, which precedes the approval.
			calls += 1;
			if (calls === 2) vi.setSystemTime(Date.now() + 31 * 60 * 1000);
			return "org_1";
		};
		const { user_code, headers } = await startDevice();
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const landing = new URL(
				await answerDeviceConsent(client, user_code, headers),
			);
			expect(landing.pathname).toBe("/device");
			expect(landing.searchParams.get("error")).toBe("expired_token");
		} finally {
			vi.useRealTimers();
		}
	});

	it("refuses the standalone approval endpoints for OAuth device codes", async () => {
		const { user_code, headers } = await startDevice();
		const hint = expect.stringContaining(
			`/oauth2/authorize?user_code=${user_code}`,
		);

		await expect(
			auth.api.deviceVerify({ query: { user_code }, headers }),
		).rejects.toMatchObject({ body: { error_description: hint } });
		await expect(
			auth.api.deviceApprove({ body: { userCode: user_code }, headers }),
		).rejects.toMatchObject({ body: { error_description: hint } });
		await expect(
			auth.api.deviceDeny({ body: { userCode: user_code }, headers }),
		).rejects.toMatchObject({ body: { error_description: hint } });
	});

	it("keeps first-party device codes on the standalone approval endpoints", async () => {
		resolveReference = requireReference;
		const { headers } = await signInWithTestUser();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: firstPartyClientId, scope: "openid" },
		});
		consentReferenceId.mockClear();
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
		expect(consentReferenceId).not.toHaveBeenCalled();

		const tokens = await auth.api.deviceToken({
			body: {
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code,
				client_id: firstPartyClientId,
			},
		});
		expect(tokens.access_token).toEqual(expect.any(String));
	});
});
