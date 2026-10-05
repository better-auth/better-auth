import { APIError } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { decodeJwt } from "jose";
import { describe, expect, expectTypeOf, it } from "vitest";
import { oauthDeviceAuthorizationClient, oauthProviderClient } from "./client";
import {
	DEVICE_CODE_GRANT_TYPE,
	oauthDeviceAuthorization,
} from "./device-code";
import { oauthProvider } from "./oauth";
import type { OAuthConsent } from "./types";

const FORM_HEADERS = { "content-type": "application/x-www-form-urlencoded" };
const baseURL = "http://localhost:3000";
const resource = "https://api.example.com";
const organizationClaim = "https://example.com/organization";

type RedirectResult = { redirect: boolean; url: string };
type TokenResponse = {
	access_token: string;
	refresh_token?: string;
	id_token?: string;
	scope: string;
};
type ErrorBody = { error?: string; error_description?: string };

function withJson(headers?: Headers) {
	const result = new Headers(headers);
	result.set("accept", "application/json");
	return result;
}

function signedQuery(url: string) {
	return new URL(url, baseURL).search.slice(1);
}

async function createDeviceTestInstance(
	options: {
		expiresIn?: `${number}${"s" | "m"}`;
		requireOrganization?: boolean;
	} = {},
) {
	const instance = await getTestInstance(
		{
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				organization(),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [resource],
					enforcePerClientResources: false,
					allowDynamicClientRegistration: true,
					allowUnauthenticatedClientRegistration: true,
					scopes: ["openid", "profile", "email", "offline_access"],
					customAccessTokenClaims: ({ referenceId }) =>
						referenceId ? { [organizationClaim]: referenceId } : {},
					...(options.requireOrganization
						? {
								postLogin: {
									page: "/select-organization",
									shouldRedirect: ({ session }) =>
										!session.activeOrganizationId,
									consentReferenceId: ({ session }) => {
										const organizationId = session.activeOrganizationId;
										if (typeof organizationId !== "string") {
											throw new APIError("BAD_REQUEST", {
												error: "organization_required",
												error_description: "Select an organization first",
											});
										}
										return organizationId;
									},
								},
							}
						: {}),
				}),
				oauthDeviceAuthorization({
					expiresIn: options.expiresIn ?? "5m",
					interval: "1s",
					verificationUri: "/device",
				}),
			],
		},
		{
			clientOptions: {
				plugins: [oauthProviderClient(), oauthDeviceAuthorizationClient()],
			},
		},
	);
	const { auth, client } = instance;

	async function createDeviceClient(grantTypes = [DEVICE_CODE_GRANT_TYPE]) {
		const { headers } = await instance.signInWithTestUser();
		const created = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				token_endpoint_auth_method: "none",
				grant_types: grantTypes,
				scope: "openid profile email offline_access",
				application_type: "native",
			},
		});
		return created!.client_id;
	}

	async function requestDeviceCode(
		clientId: string,
		scope = "openid profile offline_access",
	) {
		return auth.api.deviceCode({
			body: { client_id: clientId, scope, resource },
		});
	}

	function post<T>(path: string, body: object, headers?: Headers) {
		return client.$fetch<T>(path, {
			method: "POST",
			body,
			headers: withJson(headers),
		});
	}

	async function verify(userCode: string, headers?: Headers) {
		const res = await post<RedirectResult>(
			"/oauth2/device/verify",
			{ user_code: userCode },
			headers,
		);
		return res;
	}

	async function consent(
		consentURL: string,
		headers: Headers,
		body: { accept: boolean; scope?: string } = { accept: true },
	) {
		return post<RedirectResult>(
			"/oauth2/consent",
			{ ...body, oauth_query: signedQuery(consentURL) },
			headers,
		);
	}

	function pollToken(body: Record<string, string>) {
		return client.$fetch<TokenResponse>("/oauth2/token", {
			method: "POST",
			body: new URLSearchParams(body),
			headers: FORM_HEADERS,
		});
	}

	async function findConsent(clientId: string, userId: string) {
		const context = await auth.$context;
		return context.adapter.findOne<OAuthConsent>({
			model: "oauthConsent",
			where: [
				{ field: "clientId", value: clientId },
				{ field: "userId", value: userId },
			],
		});
	}

	return {
		...instance,
		createDeviceClient,
		requestDeviceCode,
		post,
		verify,
		consent,
		pollToken,
		findConsent,
	};
}

describe("device authorization through the OAuth Provider consent page", async () => {
	const t = await createDeviceTestInstance();

	it("sends the user code to the consent page and records consent on approval", async () => {
		const { headers, user } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient([
			DEVICE_CODE_GRANT_TYPE,
			"refresh_token",
		]);
		const { device_code, user_code } = await t.requestDeviceCode(clientId);

		const verified = await t.verify(user_code, headers);
		expect(verified.error).toBeNull();
		const consentURL = new URL(verified.data!.url, baseURL);
		expect(consentURL.pathname).toBe("/consent");
		expect(consentURL.searchParams.get("user_code")).toBe(user_code);
		expect(consentURL.searchParams.get("client_id")).toBe(clientId);
		expect(consentURL.searchParams.get("scope")).toBe(
			"openid profile offline_access",
		);
		expect(consentURL.searchParams.getAll("resource")).toEqual([resource]);
		expect(consentURL.searchParams.get("redirect_uri")).toBeNull();

		const approved = await t.consent(verified.data!.url, headers);
		expect(approved.error).toBeNull();
		expect(approved.data?.url).toBe(`${baseURL}/device?status=approved`);

		const storedConsent = await t.findConsent(clientId, user.id);
		expect(storedConsent?.scopes).toEqual([
			"openid",
			"profile",
			"offline_access",
		]);
		expect(storedConsent?.resources).toEqual([resource]);

		const tokens = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect(tokens.error).toBeNull();
		expect(tokens.data?.refresh_token).toBeDefined();
		const idToken = decodeJwt(tokens.data!.id_token!);
		expect(idToken.auth_time).toEqual(expect.any(Number));
	});

	it("asks for consent again even when the client already has consent", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const first = await t.requestDeviceCode(clientId);
		const firstConsent = await t.verify(first.user_code, headers);
		await t.consent(firstConsent.data!.url, headers);

		const second = await t.requestDeviceCode(clientId);
		const secondConsent = await t.verify(second.user_code, headers);
		expect(new URL(secondConsent.data!.url, baseURL).pathname).toBe("/consent");

		const pending = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code: second.device_code,
			client_id: clientId,
		});
		expect((pending.error as ErrorBody | null)?.error).toBe(
			"authorization_pending",
		);
	});

	it("signs the user in first and resumes at the consent page", async () => {
		const clientId = await t.createDeviceClient();
		const { user_code } = await t.requestDeviceCode(clientId);

		const verified = await t.verify(user_code);
		const loginURL = new URL(verified.data!.url, baseURL);
		expect(loginURL.pathname).toBe("/login");
		expect(loginURL.searchParams.get("user_code")).toBe(user_code);

		const signedIn = await t.post<RedirectResult>("/sign-in/email", {
			email: t.testUser.email,
			password: t.testUser.password,
			oauth_query: signedQuery(verified.data!.url),
		});
		expect(signedIn.error).toBeNull();
		const consentURL = new URL(signedIn.data!.url, baseURL);
		expect(consentURL.pathname).toBe("/consent");
		expect(consentURL.searchParams.get("user_code")).toBe(user_code);
	});

	it("records denial and returns access_denied to the polling device", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { device_code, user_code } = await t.requestDeviceCode(clientId);
		const verified = await t.verify(user_code, headers);

		const denied = await t.consent(verified.data!.url, headers, {
			accept: false,
		});
		expect(denied.data?.url).toBe(`${baseURL}/device?status=denied`);

		const res = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect((res.error as ErrorBody | null)?.error).toBe("access_denied");
	});

	it("issues only the scopes the user accepted", async () => {
		const { headers, user } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { device_code, user_code } = await t.requestDeviceCode(clientId);
		const verified = await t.verify(user_code, headers);

		const widened = await t.consent(verified.data!.url, headers, {
			accept: true,
			scope: "openid email",
		});
		expect((widened.error as ErrorBody | null)?.error).toBe("invalid_request");

		const narrowed = await t.consent(verified.data!.url, headers, {
			accept: true,
			scope: "openid",
		});
		expect(narrowed.data?.url).toBe(`${baseURL}/device?status=approved`);
		expect((await t.findConsent(clientId, user.id))?.scopes).toEqual([
			"openid",
		]);

		const tokens = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect(tokens.data?.scope).toBe("openid");
		expect(tokens.data?.refresh_token).toBeUndefined();
	});

	it("approves a device code only once", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { device_code, user_code } = await t.requestDeviceCode(clientId);
		const verified = await t.verify(user_code, headers);

		await t.consent(verified.data!.url, headers);
		const replayed = await t.consent(verified.data!.url, headers, {
			accept: false,
		});
		const replayedURL = new URL(replayed.data!.url);
		expect(replayedURL.searchParams.get("error")).toBe("invalid_request");
		expect(replayedURL.searchParams.get("status")).toBeNull();

		const reverified = await t.verify(user_code, headers);
		expect((reverified.error as ErrorBody | null)?.error).toBe(
			"invalid_request",
		);

		const body = {
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		};
		expect((await t.pollToken(body)).error).toBeNull();
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(((await t.pollToken(body)).error as ErrorBody | null)?.error).toBe(
			"invalid_grant",
		);
	});

	it("lets only one of two concurrent decisions win", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { user_code } = await t.requestDeviceCode(clientId);
		const verified = await t.verify(user_code, headers);

		const results = await Promise.all([
			t.consent(verified.data!.url, headers),
			t.consent(verified.data!.url, headers, { accept: false }),
		]);
		const decisions = results
			.map((result) => new URL(result.data!.url).searchParams.get("status"))
			.filter((status) => status !== null);
		expect(decisions).toHaveLength(1);
	});

	it("keeps a code claimed by one account away from another account", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { user_code } = await t.requestDeviceCode(clientId);
		const ownerConsent = await t.verify(user_code, headers);

		await t.auth.api.signUpEmail({
			body: {
				email: "second-device-user@example.com",
				password: "second-password",
				name: "Second User",
			},
		});
		const other = await t.signInWithUser(
			"second-device-user@example.com",
			"second-password",
		);
		const otherVerification = await t.verify(user_code, other.headers);
		const otherURL = new URL(otherVerification.data!.url);
		expect(otherURL.pathname).toBe("/device");
		expect(otherURL.searchParams.get("error")).toBe("access_denied");

		const otherConsent = await t.consent(ownerConsent.data!.url, other.headers);
		expect(new URL(otherConsent.data!.url).searchParams.get("error")).toBe(
			"access_denied",
		);
	});

	it("rejects an unknown user code without redirecting", async () => {
		const res = await t.verify("NOT-A-CODE");
		expect(res.error?.status).toBe(400);
		expect((res.error as ErrorBody | null)?.error).toBe("invalid_request");
	});

	it("records consent when the device is approved through /device/approve", async () => {
		const { headers, user } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { user_code } = await t.requestDeviceCode(clientId, "openid email");
		await t.auth.api.deviceVerify({ query: { user_code }, headers });
		await t.auth.api.deviceApprove({ body: { userCode: user_code }, headers });

		const storedConsent = await t.findConsent(clientId, user.id);
		expect(storedConsent?.scopes).toEqual(["openid", "email"]);
	});

	it("exposes user code verification on the typed client", async () => {
		const verify = (userCode: string) =>
			t.client.oauth2.device.verify({ user_code: userCode });
		expectTypeOf(verify).returns.resolves.toHaveProperty("data");
		const { data, error } = await verify("NOT-A-CODE");
		expect(data).toBeNull();
		expect(error?.status).toBe(400);
	});

	it("shares the /device rate limit with the verification endpoint", () => {
		const plugin = oauthDeviceAuthorization();
		expect(
			plugin.rateLimit.some((rule) =>
				rule.pathMatcher("/oauth2/device/verify"),
			),
		).toBe(true);
	});
});

describe("device authorization with organization selection", async () => {
	const t = await createDeviceTestInstance({ requireOrganization: true });

	it("selects an organization before consent and binds the grant to it", async () => {
		const { headers, user } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient([
			DEVICE_CODE_GRANT_TYPE,
			"refresh_token",
		]);
		const { device_code, user_code } = await t.requestDeviceCode(clientId);

		const verified = await t.verify(user_code, headers);
		const selectionURL = new URL(verified.data!.url, baseURL);
		expect(selectionURL.pathname).toBe("/select-organization");
		expect(selectionURL.searchParams.get("user_code")).toBe(user_code);

		const organization = await t.auth.api.createOrganization({
			body: { name: "Acme", slug: `acme-${user_code.toLowerCase()}` },
			headers,
		});
		await t.auth.api.setActiveOrganization({
			body: { organizationId: organization!.id },
			headers,
		});
		const continued = await t.post<RedirectResult>(
			"/oauth2/continue",
			{ postLogin: true, oauth_query: signedQuery(verified.data!.url) },
			headers,
		);
		const consentURL = new URL(continued.data!.url, baseURL);
		expect(consentURL.pathname).toBe("/consent");

		const approved = await t.consent(continued.data!.url, headers);
		expect(approved.data?.url).toBe(`${baseURL}/device?status=approved`);
		expect((await t.findConsent(clientId, user.id))?.referenceId).toBe(
			organization!.id,
		);

		const tokens = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
			resource,
		});
		expect(tokens.error).toBeNull();
		const accessToken = decodeJwt(tokens.data!.access_token);
		expect(accessToken[organizationClaim]).toBe(organization!.id);
		expect(accessToken.sub).toBe(user.id);

		const refreshed = await t.pollToken({
			grant_type: "refresh_token",
			refresh_token: tokens.data!.refresh_token!,
			client_id: clientId,
			resource,
		});
		expect(refreshed.error).toBeNull();
		expect(decodeJwt(refreshed.data!.access_token)[organizationClaim]).toBe(
			organization!.id,
		);
	});

	it("rejects /device/approve when the consent reference cannot be resolved", async () => {
		await t.auth.api.signUpEmail({
			body: {
				email: "no-organization@example.com",
				password: "no-organization",
				name: "No Organization",
			},
		});
		const { headers } = await t.signInWithUser(
			"no-organization@example.com",
			"no-organization",
		);
		const clientId = await t.createDeviceClient();
		const { device_code, user_code } = await t.requestDeviceCode(clientId);
		await t.auth.api.deviceVerify({ query: { user_code }, headers });

		await expect(
			t.auth.api.deviceApprove({ body: { userCode: user_code }, headers }),
		).rejects.toMatchObject({ body: { error: "organization_required" } });

		const res = await t.pollToken({
			grant_type: DEVICE_CODE_GRANT_TYPE,
			device_code,
			client_id: clientId,
		});
		expect((res.error as ErrorBody | null)?.error).toBe(
			"authorization_pending",
		);
	});
});

describe("device authorization expiry at verification", async () => {
	const t = await createDeviceTestInstance({ expiresIn: "1s" });

	it("rejects an expired user code", async () => {
		const { headers } = await t.signInWithTestUser();
		const clientId = await t.createDeviceClient();
		const { user_code } = await t.requestDeviceCode(clientId);
		await new Promise((resolve) => setTimeout(resolve, 1100));

		const res = await t.verify(user_code, headers);
		expect((res.error as ErrorBody | null)?.error).toBe("expired_token");
	});
});

describe("device-only client registration", async () => {
	const t = await createDeviceTestInstance();

	it("registers a device-only client without redirect URIs", async () => {
		const registered = await t.post<{
			client_id: string;
			redirect_uris?: string[];
			grant_types: string[];
		}>("/oauth2/register", {
			client_name: "Device CLI",
			token_endpoint_auth_method: "none",
			grant_types: [DEVICE_CODE_GRANT_TYPE, "refresh_token"],
		});
		expect(registered.error).toBeNull();
		expect(registered.data?.grant_types).toEqual([
			DEVICE_CODE_GRANT_TYPE,
			"refresh_token",
		]);
		expect(registered.data?.redirect_uris ?? []).toEqual([]);

		const { user_code } = await t.auth.api.deviceCode({
			body: { client_id: registered.data!.client_id, scope: "openid" },
		});
		expect(user_code).toEqual(expect.any(String));
	});
});
