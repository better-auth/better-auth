import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { getHttpTestInstance, getTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMigrations } from "../../better-auth/src/db/get-migration";
import { sso } from ".";

/**
 * Public clients (`token_endpoint_auth_method: none`) hold no secret and prove
 * possession of the authorization code with PKCE alone.
 *
 * @see https://github.com/better-auth/better-auth/issues/12080
 */
describe("SSO OIDC public clients", () => {
	const identityProvider = new OAuth2Server();
	const tokenRequests: Array<{
		body: Record<string, unknown>;
		authorization: string | undefined;
	}> = [];

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: "public-client-user",
				email: "public.user@example.com",
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token, req) => {
			tokenRequests.push({
				body: { ...req.body },
				authorization: req.headers.authorization,
			});
			token.payload.sub = "public-client-user";
			token.payload.email = "public.user@example.com";
			token.payload.email_verified = true;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	async function createInstance(
		onTestFinished: (cleanup: () => Promise<void>) => void,
		{ pkce = true }: { pkce?: boolean } = {},
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
								providerId: "public",
								oidcConfig: {
									issuer: identityProvider.issuer.url!,
									clientId: "public-client",
									pkce,
									tokenEndpointAuthentication: "none",
									discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
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

	it("exchanges the code with client_id and PKCE and never sends a client secret", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance(onTestFinished);
		const signIn = await fetch(`${baseURL}/api/auth/sign-in/sso`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseURL },
			body: JSON.stringify({
				providerId: "public",
				callbackURL: `${baseURL}/dashboard`,
			}),
		});
		const cookie = signIn.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const { url } = (await signIn.json()) as { url: string };
		const authorization = await fetch(url, { redirect: "manual" });
		const callback = await fetch(authorization.headers.get("location")!, {
			headers: { cookie },
			redirect: "manual",
		});

		expect(callback.headers.get("location")).toBe(`${baseURL}/dashboard`);
		expect(tokenRequests.at(-1)).toMatchObject({
			body: {
				client_id: "public-client",
				code_verifier: expect.any(String),
			},
			authorization: undefined,
		});
		expect(tokenRequests.at(-1)?.body).not.toHaveProperty("client_secret");
	});

	it("refuses to exchange a code for a public client without PKCE", async ({
		onTestFinished,
	}) => {
		const { baseURL } = await createInstance(onTestFinished, { pkce: false });
		const requestsBefore = tokenRequests.length;
		const signIn = await fetch(`${baseURL}/api/auth/sign-in/sso`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: baseURL },
			body: JSON.stringify({
				providerId: "public",
				callbackURL: `${baseURL}/dashboard`,
			}),
		});
		const cookie = signIn.headers
			.getSetCookie()
			.map((value) => value.split(";")[0])
			.join("; ");
		const { url } = (await signIn.json()) as { url: string };
		const authorization = await fetch(url, { redirect: "manual" });
		const callback = await fetch(authorization.headers.get("location")!, {
			headers: { cookie },
			redirect: "manual",
		});

		expect(callback.headers.get("location")).toContain(
			"error_description=pkce_required_for_public_client",
		);
		expect(tokenRequests).toHaveLength(requestsBefore);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12080
 */
describe("SSO OIDC public client registration", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		trustedOrigins: ["https://idp.example.com"],
		plugins: [sso()],
	});
	const oidcConfig = {
		clientId: "public-client",
		skipDiscovery: true,
		authorizationEndpoint: "https://idp.example.com/authorize",
		tokenEndpoint: "https://idp.example.com/token",
		jwksEndpoint: "https://idp.example.com/jwks",
		tokenEndpointAuthentication: "none" as const,
	};

	it("registers a provider that uses none without a client secret", async () => {
		const { headers } = await signInWithTestUser();
		const provider = await auth.api.registerSSOProvider({
			body: {
				providerId: "public-registration",
				issuer: "https://idp.example.com",
				domain: "public.example.com",
				oidcConfig,
			},
			headers,
		});

		expect(provider.oidcConfig).toMatchObject({
			tokenEndpointAuthentication: "none",
			pkce: true,
		});
	});

	it("rejects a provider that pairs none with a client secret", async () => {
		const { headers } = await signInWithTestUser();

		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "public-with-secret",
					issuer: "https://idp.example.com",
					domain: "secret.example.com",
					oidcConfig: { ...oidcConfig, clientSecret: "unexpected" },
				},
				headers,
			}),
		).rejects.toThrow(/clientSecret must be empty/);
	});

	it("rejects a provider that pairs none with PKCE disabled", async () => {
		const { headers } = await signInWithTestUser();

		await expect(
			auth.api.registerSSOProvider({
				body: {
					providerId: "public-without-pkce",
					issuer: "https://idp.example.com",
					domain: "nopkce.example.com",
					oidcConfig: { ...oidcConfig, pkce: false },
				},
				headers,
			}),
		).rejects.toThrow(/PKCE is required/);
	});

	it("lets an update switch a confidential provider to none only with an empty secret and PKCE", async () => {
		const { headers } = await signInWithTestUser();
		await auth.api.registerSSOProvider({
			body: {
				providerId: "becomes-public",
				issuer: "https://idp.example.com",
				domain: "becomes-public.example.com",
				oidcConfig: {
					...oidcConfig,
					clientSecret: "secret",
					tokenEndpointAuthentication: "client_secret_basic",
				},
			},
			headers,
		});
		const update = (oidcConfigUpdate: Record<string, unknown>) =>
			auth.api.updateSSOProvider({
				body: { providerId: "becomes-public", oidcConfig: oidcConfigUpdate },
				headers,
			});

		await expect(
			update({ tokenEndpointAuthentication: "none" }),
		).rejects.toThrow(/clientSecret must be empty/);
		await expect(
			update({
				tokenEndpointAuthentication: "none",
				clientSecret: "",
				pkce: false,
			}),
		).rejects.toThrow(/PKCE is required/);
		const updated = await update({
			tokenEndpointAuthentication: "none",
			clientSecret: "",
		});

		expect(updated.oidcConfig).toMatchObject({
			tokenEndpointAuthentication: "none",
		});
	});
});
