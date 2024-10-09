import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../utils/cookies";

describe("crossSubdomainCookies", () => {
	it("should update cookies with custom domain", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: "example.com",
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Domain=example.com");
					expect(setCookie).toContain("SameSite=None");
					expect(setCookie).toContain("Secure");
				},
			},
		);
	});

	it("should use default domain from baseURL if not provided", async () => {
		const { testUser, client } = await getTestInstance({
			baseURL: "https://app.example.com",
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");

					expect(setCookie).toContain("Domain=app.example.com");
				},
			},
		);
	});

	it("should only modify eligible cookies", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: ".example.com",
					eligibleCookies: [],
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(setCookie || "");
					const sessionCookie = cookies.get("better-auth.session_token");

					expect(sessionCookie).toMatchObject({
						value: expect.any(String),
						path: "/",
						httponly: true,
						samesite: "Lax",
					});
				},
			},
		);
	});

	it("should not modify cookies if none are eligible", async () => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "google",
					clientSecret: "google",
				},
			},
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: ".example.com",
					eligibleCookies: [],
				},
			},
		});

		await client.signIn.social(
			{
				provider: "google",
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).not.toContain("Domain=.example.com");
					expect(setCookie).not.toContain("SameSite=None");
				},
			},
		);
	});

	it("should handle multiple cookies correctly", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: ".example.com",
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					const cookies = setCookie?.split(", ");

					expect(cookies?.length).toBeGreaterThan(1);
					cookies?.forEach((cookie) => {
						if (
							cookie.startsWith("sessionToken=") ||
							cookie.startsWith("csrfToken=")
						) {
							expect(cookie).toContain("Domain=.example.com");
							expect(cookie).toContain("SameSite=None");
							expect(cookie).toContain("Secure");
						}
					});
				},
			},
		);
	});
});
