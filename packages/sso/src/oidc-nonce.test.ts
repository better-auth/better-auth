import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getHttpTestInstance, getTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getMigrations } from "../../better-auth/src/db/get-migration";
import { sso } from ".";
import type { OIDCConfig } from "./types";

/**
 * A nonce binds the ID token to the authorization request that produced it,
 * so a token minted for another sign-in cannot complete this one. Like a
 * conforming IdP, the mock server copies the `nonce` from the authorization
 * request into the ID token it issues for that code.
 *
 * @see https://github.com/better-auth/better-auth/issues/12081
 */
describe("SSO OIDC ID token nonce binding", () => {
	const identityProvider = new OAuth2Server();
	let tamperIdToken: ((payload: Record<string, unknown>) => void) | undefined;
	let omitIdToken = false;

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = { sub: "nonce-user", email: "nonce.user@example.com" };
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			token.payload.sub = "nonce-user";
			token.payload.email = "nonce.user@example.com";
			tamperIdToken?.(token.payload);
		});
		identityProvider.service.on("beforeResponse", (response) => {
			if (omitIdToken) response.body.id_token = undefined;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	afterEach(() => {
		tamperIdToken = undefined;
		omitIdToken = false;
	});

	async function createInstance(
		oidcConfig: Partial<OIDCConfig>,
		onTestFinished: (cleanup: () => Promise<void>) => void,
	) {
		const sqlite = new DatabaseSync(":memory:");
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		const instance = await getHttpTestInstance(
			{
				database: { db, type: "sqlite", transaction: true },
				plugins: [
					sso({
						defaultSSO: [
							{
								domain: "example.com",
								providerId: "nonce",
								oidcConfig: {
									issuer: identityProvider.issuer.url!,
									clientId: "nonce-client",
									clientSecret: "nonce-secret",
									pkce: true,
									discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
									...oidcConfig,
								},
							},
						],
					}),
				],
				trustedOrigins: [identityProvider.issuer.url!],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		const migrations = await getMigrations(instance.auth.options);
		await migrations.runMigrations();
		onTestFinished(() => instance.server.close());
		onTestFinished(() => db.destroy());
		return instance;
	}

	function cookieHeader(response: Response) {
		return response.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
	}

	/**
	 * Runs sign-in, the IdP's authorization step, and the callback.
	 * `beforeCallback` runs once the IdP has redirected back, before the
	 * callback request is sent.
	 */
	async function signIn(
		baseURL: string,
		beforeCallback?: (authorizationURL: URL) => Promise<void>,
	) {
		const response = await fetch(`${baseURL}/api/auth/sign-in/sso`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseURL },
			body: JSON.stringify({
				providerId: "nonce",
				callbackURL: `${baseURL}/dashboard`,
			}),
		});
		const cookie = cookieHeader(response);
		const { url } = (await response.json()) as { url: string };
		const authorizationURL = new URL(url);
		const authorization = await fetch(url, { redirect: "manual" });
		await beforeCallback?.(authorizationURL);
		const callback = await fetch(authorization.headers.get("location")!, {
			headers: { cookie },
			redirect: "manual",
		});
		return {
			authorizationURL,
			location: callback.headers.get("location"),
			sessionCookie: cookieHeader(callback),
		};
	}

	it("sends a nonce by default and accepts an ID token that returns it", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance({}, onTestFinished);

		const { authorizationURL, location } = await signIn(baseURL);

		expect(authorizationURL.searchParams.get("nonce")).toMatch(
			/^[A-Za-z0-9_-]{32}$/,
		);
		expect(location).toBe(`${baseURL}/dashboard`);
	});

	it("rejects an ID token that carries a different nonce", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance({}, onTestFinished);
		tamperIdToken = (payload) => {
			payload.nonce = "nonce-from-another-sign-in";
		};

		const { location } = await signIn(baseURL);

		expect(location).toContain("error=invalid_provider");
		expect(location).toContain("error_description=token_not_verified");
	});

	it("rejects an ID token that omits the nonce", async ({ onTestFinished }) => {
		const { baseURL } = await createInstance({}, onTestFinished);
		tamperIdToken = (payload) => {
			// JSON serialization drops the claim from the signed token.
			payload.nonce = undefined;
		};

		const { location } = await signIn(baseURL);

		expect(location).toContain("error=invalid_provider");
		expect(location).toContain("error_description=token_not_verified");
	});

	it("fails closed when the OAuth state carries no nonce", async ({
		onTestFinished,
	}) => {
		const { auth, baseURL } = await createInstance({}, onTestFinished);

		const { location } = await signIn(baseURL, async (authorizationURL) => {
			// A flow started before binding was enabled has no nonce in state.
			const context = await auth.$context;
			const identifier = `auth-state:${authorizationURL.searchParams.get("state")}`;
			const stored =
				await context.internalAdapter.findVerificationValue(identifier);
			const { idTokenNonce, ...stateData } = JSON.parse(stored!.value);
			expect(idTokenNonce).toBe(authorizationURL.searchParams.get("nonce"));
			await context.internalAdapter.updateVerificationByIdentifier(identifier, {
				value: JSON.stringify(stateData),
			});
		});

		expect(location).toContain("error=invalid_state");
		expect(location).toContain("error_description=nonce_binding_missing");
	});

	it("falls back to UserInfo when the provider returns no ID token", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance({}, onTestFinished);
		omitIdToken = true;

		const { location, sessionCookie } = await signIn(baseURL);

		expect(location).toBe(`${baseURL}/dashboard`);
		const session = await fetch(`${baseURL}/api/auth/get-session`, {
			headers: { cookie: sessionCookie },
		}).then((response) => response.json());
		expect(session.user.email).toBe("nonce.user@example.com");
	});

	it("sends no nonce and accepts an ID token without one when the provider opts out", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance(
			{ disableIdTokenNonceBinding: true },
			onTestFinished,
		);
		tamperIdToken = (payload) => {
			payload.nonce = undefined;
		};

		const { authorizationURL, location } = await signIn(baseURL);

		expect(authorizationURL.searchParams.has("nonce")).toBe(false);
		expect(location).toBe(`${baseURL}/dashboard`);
	});

	it("binds the restarted flow when an IdP-initiated callback arrives", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance(
			{ allowIdpInitiated: true },
			onTestFinished,
		);

		const bounce = await fetch(
			`${baseURL}/api/auth/sso/callback/nonce?code=idp-initiated-code`,
			{ redirect: "manual" },
		);
		const restarted = new URL(bounce.headers.get("location")!);
		expect(restarted.pathname).toBe("/authorize");
		expect(restarted.searchParams.get("nonce")).toMatch(/^[A-Za-z0-9_-]{32}$/);

		const authorization = await fetch(restarted, { redirect: "manual" });
		const callback = await fetch(authorization.headers.get("location")!, {
			headers: { cookie: cookieHeader(bounce) },
			redirect: "manual",
		});
		expect(callback.headers.get("location")).toBe(baseURL);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12081
 */
describe("SSO OIDC nonce binding opt-out", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		trustedOrigins: ["https://idp.example.com"],
		plugins: [sso()],
	});

	async function authorizationURL(providerId: string) {
		const { url } = await auth.api.signInSSO({
			body: { providerId, callbackURL: "/dashboard" },
		});
		return new URL(url);
	}

	it("persists the opt-out and lets an update turn binding back on", async () => {
		const { headers } = await signInWithTestUser();
		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "nonce-opt-out",
				issuer: "https://idp.example.com",
				domain: "nonce.example.com",
				oidcConfig: {
					clientId: "client",
					clientSecret: "secret",
					skipDiscovery: true,
					authorizationEndpoint: "https://idp.example.com/authorize",
					tokenEndpoint: "https://idp.example.com/token",
					jwksEndpoint: "https://idp.example.com/jwks",
					disableIdTokenNonceBinding: true,
				},
			},
			headers,
		});
		expect(provider.oidcConfig).toMatchObject({
			disableIdTokenNonceBinding: true,
		});
		expect(
			(await authorizationURL("nonce-opt-out")).searchParams.has("nonce"),
		).toBe(false);

		// An update that leaves the option out keeps the stored value.
		const renamed = await auth.api.updateSSOProvider({
			body: { providerId: "nonce-opt-out", oidcConfig: { scopes: ["openid"] } },
			headers,
		});
		expect(renamed.oidcConfig).toMatchObject({
			disableIdTokenNonceBinding: true,
		});

		const updated = await auth.api.updateSSOProvider({
			body: {
				providerId: "nonce-opt-out",
				oidcConfig: { disableIdTokenNonceBinding: false },
			},
			headers,
		});
		expect(updated.oidcConfig).toMatchObject({
			disableIdTokenNonceBinding: false,
		});
		expect(
			(await authorizationURL("nonce-opt-out")).searchParams.get("nonce"),
		).toMatch(/^[A-Za-z0-9_-]{32}$/);
	});
});
