import { describe, expect, it } from "vitest";
import { jwt } from "../../plugins/jwt";
import { getTestInstance } from "../../test-utils/test-instance";

describe("oauth-providers discovery", () => {
	it("should list email and configured social providers", async () => {
		const { customFetchImpl } = await getTestInstance({
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			socialProviders: {
				google: {
					clientId: "google-client-id",
					clientSecret: "google-client-secret",
				},
				microsoft: {
					clientId: "microsoft-client-id",
					clientSecret: "microsoft-client-secret",
					tenantId: "common",
				},
			},
		});

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/.well-known/oauth-providers",
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			issuer: string;
			providers: Array<{ id: string; enabled: boolean }>;
		};

		expect(body.issuer).toBe("http://localhost:3000/api/auth");
		expect(body.providers).toEqual([
			{ id: "email", enabled: true },
			{
				id: "google",
				enabled: true,
				redirectUri: "http://localhost:3000/api/auth/callback/google",
			},
			{
				id: "microsoft",
				enabled: true,
				redirectUri: "http://localhost:3000/api/auth/callback/microsoft",
			},
		]);
	});

	it("should honor social provider redirectURI override", async () => {
		const { customFetchImpl } = await getTestInstance(
			{
				baseURL: "http://localhost:3000",
				basePath: "/api/auth",
				emailAndPassword: { enabled: false },
				socialProviders: {
					google: {
						clientId: "google-client-id",
						clientSecret: "google-client-secret",
						redirectURI: "https://auth.example.com/custom/google",
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/.well-known/oauth-providers",
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			providers: Array<{ id: string; enabled: boolean; redirectUri?: string }>;
		};

		expect(body.providers).toEqual([
			{
				id: "google",
				enabled: true,
				redirectUri: "https://auth.example.com/custom/google",
			},
		]);
	});

	it("should omit email when email/password is disabled", async () => {
		const { customFetchImpl } = await getTestInstance(
			{
				baseURL: "http://localhost:3000",
				basePath: "/api/auth",
				emailAndPassword: { enabled: false },
				socialProviders: {
					google: {
						clientId: "google-client-id",
						clientSecret: "google-client-secret",
					},
				},
			},
			{ disableTestUser: true },
		);

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/.well-known/oauth-providers",
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			providers: Array<{ id: string; enabled: boolean }>;
		};

		expect(body.providers).toEqual([
			{
				id: "google",
				enabled: true,
				redirectUri: "http://localhost:3000/api/auth/callback/google",
			},
		]);
	});

	it("should use JWT plugin issuer when configured", async () => {
		const { customFetchImpl } = await getTestInstance({
			baseURL: "http://localhost:3000",
			basePath: "/api/auth",
			emailAndPassword: { enabled: true },
			plugins: [
				jwt({
					jwt: {
						issuer: "https://auth.example.com/api/auth",
					},
				}),
			],
		});

		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/.well-known/oauth-providers",
			{ method: "GET" },
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { issuer: string };
		expect(body.issuer).toBe("https://auth.example.com/api/auth");
	});
});
