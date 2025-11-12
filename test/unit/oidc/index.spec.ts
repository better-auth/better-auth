import fs from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import path from "node:path";
import { betterFetch } from "@better-fetch/fetch";
import { type Auth, betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { toNodeHandler } from "better-auth/node";
import { jwt, oidcProvider } from "better-auth/plugins";
import * as client from "openid-client";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "vitest";

const options = {
	key: await fs.readFile(
		path.resolve(import.meta.dirname, "../../fixtures/key.pem"),
	),
	cert: await fs.readFile(
		path.resolve(import.meta.dirname, "../../fixtures/cert.pem"),
	),
};

describe("oidc provider", async () => {
	const testClient = {
		clientId: "test-client",
		clientSecret: "test-secret",
		type: "web" as const,
		name: "Test Client",
		redirectUrls: ["https://client.example.com/callback"],
		disabled: false,
		metadata: {},
		skipConsent: true,
	};

	const authConfig = () => ({
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			oidcProvider({
				loginPage: "/auth/login",
				trustedClients: [testClient],
			}),
			jwt(),
		],
	});
	let requests: IncomingMessage[] = [];
	let server: https.Server;
	let url: string;
	let auth: Auth<ReturnType<typeof authConfig>>;

	beforeEach(async () => {
		auth = betterAuth(authConfig());
		const handler = toNodeHandler(auth);
		server = https.createServer(options, (req, res) => {
			requests.push(req);
			return handler(req, res);
		});
		await new Promise<void>((resolve) => {
			server.listen(0, () => {
				resolve();
			});
		});
		// @ts-expect-error
		auth.options.baseURL = url;
		url = `https://localhost:${(server.address() as any).port}`;
	});

	afterEach(() => {
		requests = [];
		server.close();
	});

	beforeAll(() => {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	});
	afterAll(() => {
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = "1";
	});

	it("should get server metadata correctly", async () => {
		const configuration = await client.discovery(
			new URL(`${url}/api/auth/.well-known/openid-configuration`),
			"mock",
		);
		const serverMetadata = configuration.serverMetadata();
		expect(serverMetadata).toMatchObject({
			acr_values_supported: [
				"urn:mace:incommon:iap:silver",
				"urn:mace:incommon:iap:bronze",
			],
			authorization_endpoint: expect.stringContaining(
				"/api/auth/oauth2/authorize",
			),
			claims_supported: [
				"sub",
				"iss",
				"aud",
				"exp",
				"nbf",
				"iat",
				"jti",
				"email",
				"email_verified",
				"name",
			],
			code_challenge_methods_supported: ["S256"],
			grant_types_supported: ["authorization_code", "refresh_token"],
			id_token_signing_alg_values_supported: ["HS256", "none"],
			issuer: expect.stringContaining("localhost"),
			jwks_uri: expect.stringContaining("/api/auth/jwks"),
			registration_endpoint: expect.stringContaining(
				"/api/auth/oauth2/register",
			),
			response_modes_supported: ["query"],
			response_types_supported: ["code"],
			scopes_supported: ["openid", "profile", "email", "offline_access"],
			subject_types_supported: ["public"],
			token_endpoint: expect.stringContaining("/api/auth/oauth2/token"),
			token_endpoint_auth_methods_supported: [
				"client_secret_basic",
				"client_secret_post",
				"none",
			],
			userinfo_endpoint: expect.stringContaining("/api/auth/oauth2/userinfo"),
		});
	});

	it("should perform authorization code flow", async () => {
		const config = await client.discovery(
			new URL(`${url}/api/auth/.well-known/openid-configuration`),
			"mock",
		);
		const authorizationUrl = client.buildAuthorizationUrl(config, {});

		expect(authorizationUrl.href).toContain(
			"/api/auth/oauth2/authorize?client_id=mock&response_type=code",
		);

		const result = (await betterFetch(authorizationUrl.href, {
			throw: true,
		}).catch((e) => {
			console.log(e);
			throw e;
		})) as {
			redirect: boolean;
			url: string;
		};

		{
			expect(result!.redirect).toBe(true);
			expect(result!.url).toEqual(
				"/auth/login?client_id=mock&response_type=code",
			);
		}
	});

	it("should clear oidc_login_prompt cookie when user has valid session", async () => {
		const authClient = createAuthClient({
			baseURL: `${url}/api/auth`,
		});

		let oidcLoginPromptCookie: string | undefined;
		let sessionCookieValue: string | undefined;

		await betterFetch(
			`${url}/api/auth/oauth2/authorize?client_id=${testClient.clientId}&response_type=code&redirect_uri=${encodeURIComponent("https://client.example.com/callback")}&scope=openid%20profile%20email`,
			{
				method: "GET",
				throw: false,
				onResponse(context) {
					const setCookies = context.response.headers.get("set-cookie");
					if (setCookies) {
						// Extract oidc_login_prompt cookie
						const match = setCookies.match(/oidc_login_prompt=([^;]+)/);
						if (match) {
							oidcLoginPromptCookie = `oidc_login_prompt=${match[1]}`;
						}
					}
				},
			},
		);

		expect(oidcLoginPromptCookie).toBeDefined();

		let cookieCleared = false;
		await authClient.signUp.email(
			{
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
			{
				headers: new Headers({ cookie: oidcLoginPromptCookie! }),
				onResponse(context) {
					const setCookies = context.response.headers.get("set-cookie");
					if (setCookies) {
						// Extract session cookie
						const match = setCookies.match(
							/better-auth\.session_token=([^;]+)/,
						);
						if (match) {
							sessionCookieValue = `better-auth.session_token=${match[1]}`;
						}
						cookieCleared =
							setCookies.includes("oidc_login_prompt=") &&
							(setCookies.includes("Max-Age=0") ||
								setCookies.includes("expires=Thu, 01 Jan 1970"));
					}
				},
			},
		);

		expect(sessionCookieValue).toBeDefined();
		expect(cookieCleared).toBe(true);
	});
});
