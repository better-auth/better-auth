import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { openAPI } from "better-auth/plugins";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { oauthProviderClient } from "./client";
import type { DeviceCodeGrant } from "./device-code";
import { DEVICE_CODE_GRANT_TYPE, deviceCodeGrant } from "./device-code";
import { oauthProvider } from "./oauth";

const FORM_HEADERS = { "content-type": "application/x-www-form-urlencoded" };

interface TokenErrorBody {
	status?: number;
	error?: string;
	error_description?: string;
}

describe("oauth-provider device-code composition", () => {
	it("requires the shared grant in the provider extension list", async () => {
		const grant = deviceCodeGrant();
		await expect(
			(async () =>
				getTestInstance({
					plugins: [
						jwt(),
						deviceAuthorization({ grant }),
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
						}),
					],
				}))(),
		).rejects.toMatchObject({
			message:
				"deviceCodeGrant must be passed to oauthProvider({ extensions: [grant] }) as well as deviceAuthorization({ grant }).",
		});
	});

	it("requires the shared grant in Device Authorization", async () => {
		const grant = deviceCodeGrant();
		await expect(
			(async () =>
				getTestInstance({
					plugins: [
						jwt(),
						oauthProvider({
							loginPage: "/login",
							consentPage: "/consent",
							extensions: [grant],
						}),
					],
				}))(),
		).rejects.toMatchObject({
			message:
				"deviceCodeGrant must be passed to deviceAuthorization({ grant }) as well as oauthProvider({ extensions: [grant] }).",
		});
	});

	it("exposes resource only in composed client and OpenAPI contracts", async () => {
		const standaloneClient = createAuthClient({
			plugins: [deviceAuthorizationClient()],
		});
		const composedClient = createAuthClient({
			plugins: [deviceAuthorizationClient<DeviceCodeGrant>()],
		});
		type StandaloneDeviceCodeInput = Parameters<
			typeof standaloneClient.device.code
		>[0];
		type ComposedDeviceCodeInput = Parameters<
			typeof composedClient.device.code
		>[0];
		expectTypeOf<StandaloneDeviceCodeInput>().not.toHaveProperty("resource");
		expectTypeOf<ComposedDeviceCodeInput>()
			.toHaveProperty("resource")
			.toEqualTypeOf<string | string[] | undefined>();

		const { auth: standaloneAuth } = await getTestInstance({
			plugins: [deviceAuthorization(), openAPI()],
		});
		const grant = deviceCodeGrant();
		const { auth: composedAuth } = await getTestInstance({
			plugins: [
				jwt(),
				deviceAuthorization({ grant }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					extensions: [grant],
				}),
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
					};
				}
			>;
		};
		const getRequestProperties = (document: unknown) =>
			(document as OpenAPIDocument).paths["/device/code"]?.post?.requestBody
				?.content?.["application/json"]?.schema?.properties ?? {};
		const standaloneDocument = await standaloneAuth.api.generateOpenAPISchema();
		const composedDocument = await composedAuth.api.generateOpenAPISchema();

		expect(getRequestProperties(standaloneDocument)).not.toHaveProperty(
			"resource",
		);
		expect(getRequestProperties(composedDocument)).toHaveProperty("resource");
	});
});

describe("oauth-provider device-code grant", async () => {
	const baseURL = "http://localhost:3000";
	const resource = "https://api.example.com";
	const secondResource = "https://files.example.com";
	const oauthDeviceGrant = deviceCodeGrant();
	const onDeviceAuthRequest = vi.fn();

	const { auth, client, db, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				deviceAuthorization({
					expiresIn: "5min",
					interval: "2s",
					grant: oauthDeviceGrant,
					onDeviceAuthRequest,
				}),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					extensions: [oauthDeviceGrant],
					resources: [resource, secondResource],
					enforcePerClientResources: false,
					allowDynamicClientRegistration: true,
					scopes: ["openid", "profile", "email", "offline_access"],
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
		const oauthDeviceAuthorization = deviceAuthorization({
			grant: deviceCodeGrant(),
		});
		const oauthFields = oauthDeviceAuthorization.schema.deviceCode?.fields;

		expect(standaloneFields).not.toHaveProperty("resource");
		expect(standaloneFields).not.toHaveProperty("resources");
		expect(standaloneFields).not.toHaveProperty("oauthClientId");
		expect(oauthFields).toHaveProperty("resources");
		expect(oauthFields).toHaveProperty("oauthClientId");
		expect(
			oauthDeviceAuthorization.endpoints.deviceCode.options.error.safeParse({
				error: "invalid_target",
				error_description: "Unsupported resource",
			}).success,
		).toBe(true);
	});

	/** Registers a public OAuth client able to use the device-code grant. */
	async function createDeviceClient(
		grantTypes: string[] = [DEVICE_CODE_GRANT_TYPE],
	) {
		const { headers } = await signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: grantTypes,
				scope: "openid profile email",
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
		const verification = await auth.api.deviceVerify({
			query: { user_code },
			headers,
		});
		if (requestedResource !== undefined) {
			expect(verification.resource).toEqual(requestedResource);
		}
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
		return device_code;
	}

	function pollToken(body: Record<string, string>) {
		return client.$fetch<Record<string, unknown>>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams(body),
			headers: FORM_HEADERS,
		});
	}

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

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10746#discussion_r3751563636
	 */
	it.each([
		["relative", "/api"],
		["fragmented", `${resource}#fragment`],
		["dangerous-scheme", "javascript:alert(1)"],
		["array-item", [resource, "/api"]],
	])("rejects %s RFC 8707 resource indicators at the request boundary", (_label, invalidResource) => {
		const endpoint = deviceAuthorization({
			grant: deviceCodeGrant(),
		}).endpoints.deviceCode;

		expect(
			endpoint.options.body?.safeParse({
				client_id: "client",
				resource: invalidResource,
			}).success,
		).toBe(false);
	});

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
		const verification = await auth.api.deviceVerify({
			query: { user_code: response.data!.user_code as string },
			headers,
		});
		expect(verification.resource).toEqual([resource, secondResource]);
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
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceDeny({ body: { userCode: user_code }, headers });

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
		// A plain device client id that is NOT a registered OAuth client keeps the
		// original first-party device flow (session token), unaffected by the guard.
		const firstPartyClientId = "first-party-cli";
		const { headers } = await signInWithTestUser();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: firstPartyClientId },
		});
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });

		const res = await client.$fetch<Record<string, unknown>>("/device/token", {
			method: "POST",
			body: {
				grant_type: DEVICE_CODE_GRANT_TYPE,
				device_code,
				client_id: firstPartyClientId,
			},
		});
		expect(res.error).toBeNull();
		expect(res.data?.access_token).toBeDefined();
		expect(res.data?.token_type).toBe("Bearer");
	});
});

describe("oauth-provider device-code immutable routing", async () => {
	const baseURL = "http://localhost:3007";
	const firstPartyClientId = "late-registered-oauth-client";
	const grant = deviceCodeGrant();
	const { auth, client, signInWithTestUser } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			deviceAuthorization({ grant }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				extensions: [grant],
				generateClientId: () => firstPartyClientId,
				scopes: ["openid"],
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
	const oauthDeviceGrant = deviceCodeGrant();

	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				deviceAuthorization({
					expiresIn: "1s",
					interval: "1s",
					grant: oauthDeviceGrant,
				}),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					extensions: [oauthDeviceGrant],
					allowDynamicClientRegistration: true,
					scopes: ["openid", "profile", "email"],
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
	const sharedDeviceCodeGrant = deviceCodeGrant();
	const first = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			deviceAuthorization({ grant: sharedDeviceCodeGrant }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
				extensions: [
					sharedDeviceCodeGrant,
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
		],
	});

	await getTestInstance({
		baseURL: "http://localhost:3001",
		plugins: [
			jwt({ jwt: { issuer: "http://localhost:3001" } }),
			deviceAuthorization({ grant: sharedDeviceCodeGrant }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				scopes: ["openid"],
				extensions: [sharedDeviceCodeGrant],
			}),
		],
	});

	it("keeps each auth instance bound to its own provider options", async () => {
		const { headers } = await first.signInWithTestUser();
		const { device_code, user_code } = await first.auth.api.deviceCode({
			body: { client_id: discoveredClientId, scope: "openid" },
		});
		await first.auth.api.deviceVerify({ query: { user_code }, headers });
		await first.auth.api.deviceApprove({
			body: { userCode: user_code },
			headers,
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
