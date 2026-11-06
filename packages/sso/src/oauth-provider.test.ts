import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { betterFetch } from "@better-fetch/fetch";
import { jwt } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sso } from ".";
import { ssoClient } from "./client";

const idp = new OAuth2Server();

/**
 * @see https://github.com/better-auth/better-auth/issues/11349
 */
describe("SSO sign-in during an oauth-provider authorization", async () => {
	const baseURL = "http://localhost:3000";
	const redirectURI = "http://localhost:5000/callback";
	await idp.issuer.keys.generate("RS256");
	await idp.start(undefined, "127.0.0.1");
	const issuer = idp.issuer.url!;
	const { auth, client, signInWithTestUser, customFetchImpl, cookieSetter } =
		await getTestInstance(
			{
				baseURL,
				trustedOrigins: [issuer],
				plugins: [
					jwt(),
					oauthProvider({ loginPage: "/login", consentPage: "/consent" }),
					sso(),
				],
			},
			{ clientOptions: { plugins: [oauthProviderClient(), ssoClient()] } },
		);

	let clientId = "";

	const profile = {
		sub: "sso-resume",
		email: "resume@sso-resume.com",
		email_verified: true,
		name: "Resume User",
	};
	idp.service.on("beforeTokenSigning", (token) => {
		Object.assign(token.payload, profile);
	});
	idp.service.on("beforeUserinfo", (userInfoResponse) => {
		userInfoResponse.body = profile;
		userInfoResponse.statusCode = 200;
	});

	beforeAll(async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				issuer,
				domain: "sso-resume.com",
				providerId: "resume",
				oidcConfig: {
					clientId: "resume",
					clientSecret: "resume",
					authorizationEndpoint: `${issuer}/authorize`,
					tokenEndpoint: `${issuer}/token`,
					jwksEndpoint: `${issuer}/jwks`,
					discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
					mapping: {
						email: "email",
						emailVerified: "email_verified",
						name: "name",
					},
				},
			},
			headers,
		});
		const oauthClient = await auth.api.adminCreateOAuthClient({
			headers,
			body: {
				redirect_uris: [redirectURI],
				application_type: "native",
				token_endpoint_auth_method: "client_secret_post",
				skip_consent: true,
			},
		});
		clientId = oauthClient.client_id;
	});

	afterAll(async () => {
		vi.unstubAllGlobals();
		await idp.stop().catch(() => {});
	});

	it("resumes the authorization after a signed-out OIDC SSO login", async () => {
		const authorize = new URL(`${baseURL}/api/auth/oauth2/authorize`);
		authorize.search = new URLSearchParams({
			client_id: clientId,
			response_type: "code",
			redirect_uri: redirectURI,
			scope: "openid",
			state: "client-state",
			code_challenge: createHash("sha256")
				.update("resume-code-verifier-0123456789abcdefghijklmnop")
				.digest("base64url"),
			code_challenge_method: "S256",
		}).toString();
		const loginRedirect = await auth.handler(new Request(authorize));
		const loginURL = new URL(loginRedirect.headers.get("location")!, baseURL);
		expect(loginURL.pathname).toBe("/login");

		vi.stubGlobal("window", { location: { search: loginURL.search } });
		const headers = new Headers();
		const res = await client.signIn.sso({
			email: "resume@sso-resume.com",
			callbackURL: "/dashboard",
			fetchOptions: { throw: true, onSuccess: cookieSetter(headers) },
		});

		let idpRedirect = "";
		await betterFetch(res.url, {
			method: "GET",
			redirect: "manual",
			onError(context) {
				idpRedirect = context.response.headers.get("location") || "";
			},
		});
		let callbackLocation = "";
		headers.set("sec-fetch-mode", "navigate");
		await betterFetch(idpRedirect, {
			method: "GET",
			customFetchImpl,
			headers,
			onError(context) {
				callbackLocation = context.response.headers.get("location") || "";
			},
		});

		const resumed = new URL(callbackLocation, baseURL);
		expect(`${resumed.origin}${resumed.pathname}`).toBe(redirectURI);
		expect(resumed.searchParams.get("code")).toBeTruthy();
		expect(resumed.searchParams.get("state")).toBe("client-state");
	});
});
