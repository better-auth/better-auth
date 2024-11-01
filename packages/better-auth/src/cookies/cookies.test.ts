import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { getCookies, type BetterAuthOptions } from "../index";

describe("cookies", async () => {
	const { client, testUser } = await getTestInstance();
	it("should set cookies with default options", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toBeDefined();
					expect(setCookie).toContain("Path=/");
					expect(setCookie).toContain("HttpOnly");
					expect(setCookie).toContain("SameSite=Lax");
					expect(setCookie).toContain("better-auth");
				},
			},
		);
	});

	it("should set multiple cookies", async () => {
		await client.signIn.social(
			{
				provider: "github",
				callbackURL: "https://example.com",
			},
			{
				onSuccess(context) {
					const cookies = context.response.headers.get("Set-Cookie");
					expect(cookies?.split(",").length).toBeGreaterThan(1);
				},
			},
		);
	});

	it("should use secure cookies", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: { useSecureCookies: true },
		});
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Secure");
				},
			},
		);
	});

	it("should use secure cookies when the base url is https", async () => {
		const { client, testUser } = await getTestInstance({
			baseURL: "https://example.com",
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Secure");
				},
			},
		);
	});
});

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
					expect(setCookie).toContain("SameSite=Lax");
				},
			},
		);
	});

	it("should use default domain from baseURL if not provided", async () => {
		const { testUser, client } = await getTestInstance({
			baseURL: "https://example.com",
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
					expect(setCookie).toContain("Domain=example.com");
				},
			},
		);
	});
});

describe("cookie configuration", () => {
	it("should return correct cookie options based on configuration", async () => {
		const options = {
			baseURL: "https://example.com",
			database: {} as BetterAuthOptions["database"],
			advanced: {
				useSecureCookies: true,
				crossSubDomainCookies: {
					enabled: true,
					domain: "example.com",
				},
				cookiePrefix: "test-prefix",
			},
		} satisfies BetterAuthOptions;

		const cookies = getCookies(options);

		expect(cookies.sessionToken.options.secure).toBe(true);
		expect(cookies.sessionToken.name).toContain("test-prefix.session_token");
		expect(cookies.sessionData.options.sameSite).toBe("lax");
		expect(cookies.sessionData.options.domain).toBe("example.com");
	});
});
