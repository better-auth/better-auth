import {
	DEVICE_CODE_GRANT_TYPE,
	oauthDeviceAuthorization,
	oauthProvider,
} from "@better-auth/oauth-provider";
import { expect, test } from "@playwright/test";
import { jwt } from "better-auth/plugins/jwt";
import { createLocalJWKSet, jwtVerify } from "jose";
import { setupServer } from "./utils";

const FORM_HEADERS = {
	"content-type": "application/x-www-form-urlencoded",
};

type AuthorizationServerMetadata = {
	issuer: string;
	registration_endpoint: string;
	device_authorization_endpoint: string;
	token_endpoint: string;
	jwks_uri: string;
	grant_types_supported: string[];
};

type DeviceAuthorizationResponse = {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete: string;
	interval: number;
};

type OAuthTokenResponse = {
	access_token: string;
	token_type: string;
	scope: string;
};

async function responseJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

test.describe("OAuth device-code grant over HTTP", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10135
	 */
	test("registers, approves, and exchanges a resource-bound device code", async ({
		browser,
	}) => {
		const resource = "https://api.example.com";
		const { port, stop } = await setupServer(
			{
				baseURL: {
					allowedHosts: ["127.0.0.1:*"],
					protocol: "http",
				},
				plugins: [
					jwt(),
					oauthProvider({
						loginPage: "/login",
						consentPage: "/consent",
						allowDynamicClientRegistration: true,
						allowUnauthenticatedClientRegistration: true,
						resources: [resource],
						clientRegistrationAllowedResources: [resource],
						scopes: ["openid", "profile", "email"],
					}),
					oauthDeviceAuthorization({
						expiresIn: "5min",
						interval: "1s",
					}),
				],
			},
			{ disableTestUser: true },
		);
		const origin = `http://127.0.0.1:${port}`;
		const authBaseURL = `${origin}/api/auth`;
		const approvalContext = await browser.newContext({ baseURL: origin });

		try {
			const metadataResponse = await fetch(
				`${authBaseURL}/.well-known/oauth-authorization-server`,
			);
			expect(metadataResponse.status).toBe(200);
			const metadata =
				await responseJson<AuthorizationServerMetadata>(metadataResponse);
			expect(metadata).toMatchObject({
				issuer: authBaseURL,
				registration_endpoint: `${authBaseURL}/oauth2/register`,
				device_authorization_endpoint: `${authBaseURL}/device/code`,
				token_endpoint: `${authBaseURL}/oauth2/token`,
				jwks_uri: `${authBaseURL}/jwks`,
			});
			expect(metadata.grant_types_supported).toContain(DEVICE_CODE_GRANT_TYPE);

			const registrationResponse = await fetch(metadata.registration_endpoint, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					client_name: "Device CLI",
					application_type: "native",
					redirect_uris: [`${origin}/callback`],
					token_endpoint_auth_method: "none",
					grant_types: [DEVICE_CODE_GRANT_TYPE],
					scope: "openid profile email",
					resources: [resource],
				}),
			});
			expect(registrationResponse.status).toBe(201);
			const registeredClient = await responseJson<{
				client_id: string;
				client_secret?: string;
				token_endpoint_auth_method: string;
			}>(registrationResponse);
			expect(registeredClient.client_id).toBeTruthy();
			expect(registeredClient.client_secret).toBeUndefined();
			expect(registeredClient.token_endpoint_auth_method).toBe("none");

			const authorizationResponse = await fetch(
				metadata.device_authorization_endpoint,
				{
					method: "POST",
					headers: FORM_HEADERS,
					body: new URLSearchParams({
						client_id: registeredClient.client_id,
						scope: "openid profile email",
						resource,
					}),
				},
			);
			expect(authorizationResponse.status).toBe(200);
			const deviceAuthorizationResult =
				await responseJson<DeviceAuthorizationResponse>(authorizationResponse);
			expect(deviceAuthorizationResult.verification_uri).toBe(
				`${origin}/device`,
			);
			expect(deviceAuthorizationResult.verification_uri_complete).toContain(
				`user_code=${deviceAuthorizationResult.user_code}`,
			);
			expect(deviceAuthorizationResult.interval).toBe(1);

			const pollDeviceToken = () =>
				fetch(metadata.token_endpoint, {
					method: "POST",
					headers: FORM_HEADERS,
					body: new URLSearchParams({
						grant_type: DEVICE_CODE_GRANT_TYPE,
						device_code: deviceAuthorizationResult.device_code,
						client_id: registeredClient.client_id,
						resource,
					}),
				});

			const pendingResponse = await pollDeviceToken();
			expect(pendingResponse.status).toBe(400);
			expect(
				await responseJson<{ error: string }>(pendingResponse),
			).toMatchObject({
				error: "authorization_pending",
			});

			const signUpResponse = await approvalContext.request.post(
				`${authBaseURL}/sign-up/email`,
				{
					headers: { origin },
					data: {
						name: "Device User",
						email: "device-user@example.com",
						password: "correct-horse-battery-staple",
					},
				},
			);
			expect(signUpResponse.ok(), await signUpResponse.text()).toBe(true);

			const verificationResponse = await approvalContext.request.get(
				`${authBaseURL}/device?user_code=${encodeURIComponent(deviceAuthorizationResult.user_code)}`,
			);
			expect(verificationResponse.ok(), await verificationResponse.text()).toBe(
				true,
			);
			expect(await verificationResponse.json()).toMatchObject({
				status: "pending",
				client_id: registeredClient.client_id,
				scope: "openid profile email",
				resource,
			});

			const approvalResponse = await approvalContext.request.post(
				`${authBaseURL}/device/approve`,
				{
					headers: { origin },
					data: { userCode: deviceAuthorizationResult.user_code },
				},
			);
			expect(approvalResponse.ok(), await approvalResponse.text()).toBe(true);

			const standaloneTokenResponse = await fetch(
				`${authBaseURL}/device/token`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						grant_type: DEVICE_CODE_GRANT_TYPE,
						device_code: deviceAuthorizationResult.device_code,
						client_id: registeredClient.client_id,
					}),
				},
			);
			expect(standaloneTokenResponse.status).toBe(400);
			expect(
				await responseJson<{ error: string; error_description: string }>(
					standaloneTokenResponse,
				),
			).toMatchObject({
				error: "invalid_grant",
				error_description: expect.stringContaining("/oauth2/token"),
			});

			await new Promise((resolve) => setTimeout(resolve, 1_100));
			const tokenResponse = await pollDeviceToken();
			expect(tokenResponse.status).toBe(200);
			const tokens = await responseJson<OAuthTokenResponse>(tokenResponse);
			expect(tokens).toMatchObject({
				token_type: "Bearer",
				scope: "openid profile email",
				access_token: expect.any(String),
			});

			const jwksResponse = await fetch(metadata.jwks_uri);
			expect(jwksResponse.status).toBe(200);
			const jwks = createLocalJWKSet(await jwksResponse.json());
			const verifiedAccessToken = await jwtVerify(tokens.access_token, jwks, {
				issuer: metadata.issuer,
				audience: resource,
			});
			expect(verifiedAccessToken.protectedHeader.typ).toBe("at+jwt");
			expect(verifiedAccessToken.payload).toMatchObject({
				client_id: registeredClient.client_id,
				scope: "openid profile email",
			});
			expect(verifiedAccessToken.payload.sub).toBeTruthy();

			const replayResponse = await pollDeviceToken();
			expect(replayResponse.status).toBe(400);
			expect(
				await responseJson<{ error: string }>(replayResponse),
			).toMatchObject({
				error: "invalid_grant",
			});
		} finally {
			await approvalContext.close();
			await stop();
		}
	});
});
