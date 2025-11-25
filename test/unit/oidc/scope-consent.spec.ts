import fs from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { betterFetch } from "@better-fetch/fetch";
import type { Auth } from "better-auth";
import { betterAuth } from "better-auth";
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

describe("oidc scope consent", async () => {
	const authConfig = () => ({
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			oidcProvider({
				loginPage: "/auth/login",
				consentPage: "/auth/consent",
			}),
			jwt(),
		],
	});
	let requests: any[] = [];
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
		url = `https://localhost:${(server.address() as any).port}`;
		// @ts-expect-error
		auth.options.baseURL = url;
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

	it("should require new consent when scopes are expanded", async () => {
		// 1. Create a user and login
		await auth.api.signUpEmail({
			body: {
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
		});

		const signInRes = await auth.api.signInEmail({
			body: {
				email: "test@example.com",
				password: "password123",
			},
			asResponse: true,
		});
		const cookie = signInRes.headers.get("set-cookie");

		// 2. Register a client
		let clientReg: Awaited<
			ReturnType<typeof auth.api.registerOAuthApplication>
		>;
		try {
			clientReg = await auth.api.registerOAuthApplication({
				body: {
					client_name: "scope-test-client",
					redirect_uris: ["https://rp.example.com/callback"],
				},
				headers: {
					cookie: cookie || "",
				},
			});
		} catch (e) {
			console.error(e);
			throw e;
		}

		// 3. Discover configuration
		const config = await client.discovery(
			new URL(`${url}/api/auth/.well-known/openid-configuration`),
			clientReg.client_id,
			clientReg.client_secret,
		);

		// 4. Initial request with base scopes
		const authorizationUrl1 = client.buildAuthorizationUrl(config, {
			redirect_uri: "https://rp.example.com/callback",
			scope: "openid profile",
			code_challenge: "challenge",
			code_challenge_method: "S256",
		});

		const res1 = await betterFetch<{ redirect: boolean; url: string }>(
			authorizationUrl1.href,
			{
				headers: {
					cookie: cookie || "",
				},
			},
		);

		let redirectURI1 = "";
		if (res1.data?.redirect) {
			redirectURI1 = res1.data.url;
		}

		// Should require consent initially
		expect(redirectURI1).toContain("consent_code=");

		// Extract consent code and accept
		const consentUrl1 = new URL(redirectURI1, "http://localhost");
		const consentCode1 = consentUrl1.searchParams.get("consent_code");

		await auth.api.oAuthConsent({
			body: {
				accept: true,
				consent_code: consentCode1!,
			},
			headers: {
				cookie: cookie || "",
			},
		});

		// 5.  Second request with base scopes (no change)
		{
			const authorizationUrl2 = client.buildAuthorizationUrl(config, {
				redirect_uri: "https://rp.example.com/callback",
				scope: "openid profile",
				code_challenge: "challenge",
				code_challenge_method: "S256",
			});

			const res2 = await betterFetch<{ redirect: boolean; url: string }>(
				authorizationUrl2.href,
				{
					headers: {
						cookie: cookie || "",
					},
				},
			);

			let redirectURI2 = "";
			if (res2.data?.redirect) {
				redirectURI2 = res2.data.url;
			}

			// Should NOT require consent because scopes are unchanged
			expect(redirectURI2).not.toContain("consent_code=");
			expect(redirectURI2).toContain("code=");
		}

		{
			// 6. Third request with EXPANDED scopes (adding email)
			const authorizationUrl2 = client.buildAuthorizationUrl(config, {
				redirect_uri: "https://rp.example.com/callback",
				scope: "openid profile email",
				code_challenge: "challenge",
				code_challenge_method: "S256",
			});

			const res2 = await betterFetch<{ redirect: boolean; url: string }>(
				authorizationUrl2.href,
				{
					headers: {
						cookie: cookie || "",
					},
				},
			);

			let redirectURI2 = "";
			if (res2.data?.redirect) {
				redirectURI2 = res2.data.url;
			}

			// Should require consent again because scope expanded
			expect(redirectURI2).toContain("consent_code=");
		}
	});
});
