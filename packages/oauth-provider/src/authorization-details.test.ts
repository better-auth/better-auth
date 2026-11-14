import { generateRandomString } from "better-auth/crypto";
import { generateCodeChallenge } from "better-auth/oauth2";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import type { BetterAuthPlugin } from "better-auth/types";
import { decodeJwt } from "jose";
import { describe, expect, it } from "vitest";
import { extendOAuthProvider } from "./extensions";
import { oauthProvider } from "./oauth";

const baseURL = "http://localhost:3000";
const redirectUri = "https://rp.example.com/api/auth/callback/test";
const authorizationDetails = JSON.stringify([{ type: "payment_initiation" }]);

/** An extension that advertises RFC 9396 types, as CIBA does. */
const advertiseTypes = {
	id: "advertise-types",
	init(ctx) {
		extendOAuthProvider(ctx, {
			metadata: () => ({
				authorization_details_types_supported: ["payment_initiation"],
			}),
		});
	},
} satisfies BetterAuthPlugin;

async function setup(plugins: BetterAuthPlugin[]) {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		baseURL,
		plugins: [
			jwt({ jwt: { issuer: baseURL } }),
			oauthProvider({
				loginPage: "/login",
				consentPage: "/consent",
				pushedAuthorizationRequests: { enabled: true },
			}),
			...plugins,
		],
	});
	const { headers } = await signInWithTestUser();
	const client = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			redirect_uris: [redirectUri],
			skip_consent: true,
		},
	});
	const params = {
		client_id: client.client_id,
		response_type: "code",
		redirect_uri: redirectUri,
		scope: "openid",
		state: "rar-state",
		code_challenge: await generateCodeChallenge(generateRandomString(43)),
		code_challenge_method: "S256",
		authorization_details: authorizationDetails,
	};

	async function authorize() {
		const url = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		for (const [key, value] of Object.entries(params)) {
			url.searchParams.set(key, value);
		}
		const response = await customFetchImpl(url.toString(), {
			headers,
			redirect: "manual",
		});
		return new URL(response.headers.get("Location") ?? "", baseURL);
	}

	async function push() {
		const response = await customFetchImpl(`${baseURL}/api/auth/oauth2/par`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				...params,
				client_secret: client.client_secret!,
			}).toString(),
		});
		return { status: response.status, body: await response.json() };
	}

	return { authorize, push };
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc9396.html#section-5
 */
describe("authorization_details at the authorization endpoint", () => {
	it("rejects them when discovery advertises types", async () => {
		const { authorize } = await setup([advertiseTypes]);
		const location = await authorize();
		expect(location.origin + location.pathname).toBe(redirectUri);
		expect(location.searchParams.get("error")).toBe(
			"invalid_authorization_details",
		);
		expect(location.searchParams.get("state")).toBe("rar-state");
	});

	it("rejects a pushed request when discovery advertises types", async () => {
		const { push } = await setup([advertiseTypes]);
		const res = await push();
		expect(res.status).toBe(400);
		expect(res.body.error).toBe("invalid_authorization_details");
	});

	/**
	 * @see https://www.rfc-editor.org/rfc/rfc6749.html#section-3.1
	 */
	it("ignores them when the server advertises no types", async () => {
		const { authorize } = await setup([]);
		const location = await authorize();
		expect(location.searchParams.get("error")).toBeNull();
		expect(location.searchParams.get("code")).toBeTruthy();
	});
});

const grantType = "urn:example:params:grant-type:rar-test";
const resource = "https://api.example.com";
const otherResource = "https://files.example.com";
const forApi = { type: "payment_initiation", locations: [resource] };
const forFiles = { type: "file_access", locations: [otherResource] };
const everywhere = { type: "account_information" };

/** An extension grant that issues the details it is given, as CIBA does. */
const issueDetails = {
	id: "issue-details",
	init(ctx) {
		extendOAuthProvider(ctx, {
			grants: {
				[grantType]: async ({ ctx, provider }) => {
					const { client } = await provider.authenticateClient({});
					const found = await ctx.context.internalAdapter.findUserByEmail(
						(ctx.body as { login_hint: string }).login_hint,
					);
					const resource = (ctx.body as { resource?: string }).resource;
					return provider.issueTokens({
						client,
						scopes: ["openid", "offline_access"],
						user: found!.user,
						resources: resource ? [resource] : undefined,
						authorizationDetails: [forApi, forFiles, everywhere],
					});
				},
			},
		});
	},
} satisfies BetterAuthPlugin;

/**
 * @see https://www.rfc-editor.org/rfc/rfc9396.html#section-9
 */
describe("issueTokens with authorizationDetails", async () => {
	const forged = [{ type: "forged" }];
	const { auth, signInWithTestUser, customFetchImpl, testUser } =
		await getTestInstance({
			baseURL,
			plugins: [
				jwt({ jwt: { issuer: baseURL } }),
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
					resources: [
						resource,
						{
							identifier: otherResource,
							customClaims: { authorization_details: forged },
						},
					],
					enforcePerClientResources: false,
					customAccessTokenClaims: () => ({ authorization_details: forged }),
				}),
				issueDetails,
			],
		});
	const { headers } = await signInWithTestUser();
	const client = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			token_endpoint_auth_method: "client_secret_post",
			grant_types: [grantType, "refresh_token"],
			scope: "openid offline_access",
		},
	});
	const credentials = {
		client_id: client.client_id,
		client_secret: client.client_secret!,
	};

	async function post(path: string, body: Record<string, string>) {
		const response = await customFetchImpl(`${baseURL}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ ...credentials, ...body }).toString(),
		});
		return response.json() as Promise<Record<string, unknown>>;
	}
	const issue = (extra: Record<string, string> = {}) =>
		post("/oauth2/token", {
			grant_type: grantType,
			login_hint: testUser.email,
			...extra,
		});

	it("issues the details for the token's resource in the response and the JWT", async () => {
		const tokens = await issue({ resource });
		expect(tokens.authorization_details).toEqual([forApi, everywhere]);
		expect(
			decodeJwt(tokens.access_token as string).authorization_details,
		).toEqual([forApi, everywhere]);
	});

	it("keeps the details over custom claims and returns them at introspection", async () => {
		const jwtTokens = await issue({ resource: otherResource });
		expect(
			decodeJwt(jwtTokens.access_token as string).authorization_details,
		).toEqual([forFiles, everywhere]);
		const opaque = await issue();
		expect(opaque.authorization_details).toEqual([everywhere]);
		const introspection = await post("/oauth2/introspect", {
			token: opaque.access_token as string,
		});
		expect(introspection.authorization_details).toEqual([everywhere]);
	});

	it("issues no refresh token, because refreshed tokens would lose the details", async () => {
		const tokens = await issue({ resource });
		expect(tokens.refresh_token).toBeUndefined();
	});
});
