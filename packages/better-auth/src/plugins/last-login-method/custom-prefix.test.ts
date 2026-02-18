import { describe, expect, it } from "vitest";
import { parseCookies } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";

describe("lastLoginMethod custom cookie prefix", async () => {
	it("should work with default cookie name regardless of custom prefix", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				advanced: {
					cookiePrefix: "custom-auth",
				},
				plugins: [lastLoginMethod()],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		// Uses exact cookie name from config, not affected by cookiePrefix
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should work with custom cookie name and prefix", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				advanced: {
					cookiePrefix: "my-app",
				},
				plugins: [lastLoginMethod({ cookieName: "my-app.last_method" })],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("my-app.last_method")).toBe("email");
	});

	it("should work with custom cookie name regardless of prefix", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				advanced: {
					cookiePrefix: "my-app",
				},
				plugins: [lastLoginMethod({ cookieName: "last_login_method" })],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		// Uses exact cookie name from config, not affected by cookiePrefix
		expect(cookies.get("last_login_method")).toBe("email");
	});

	it("should work with cross-subdomain and custom prefix", async () => {
		const { client, testUser } = await getTestInstance(
			{
				baseURL: "https://auth.example.com",
				advanced: {
					cookiePrefix: "custom-auth",
					crossSubDomainCookies: {
						enabled: true,
						domain: "example.com",
					},
				},
				plugins: [lastLoginMethod()],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

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
					// Uses exact cookie name from config, not affected by cookiePrefix
					expect(setCookie).toContain(
						"better-auth.last_used_login_method=email",
					);
				},
			},
		);
	});

	it("should work with cross-origin cookies", async () => {
		const { client, testUser } = await getTestInstance(
			{
				baseURL: "https://api.example.com",
				advanced: {
					crossOriginCookies: {
						enabled: true,
					},
					defaultCookieAttributes: {
						sameSite: "none",
						secure: true,
					},
				},
				plugins: [lastLoginMethod()],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("SameSite=None");
					expect(setCookie).toContain("Secure");
					// Should not contain Domain attribute for cross-origin
					expect(setCookie).not.toContain("Domain=");
					expect(setCookie).toContain(
						"better-auth.last_used_login_method=email",
					);
				},
			},
		);
	});

	it("should handle cross-origin on localhost for development", async () => {
		const { client, testUser } = await getTestInstance(
			{
				baseURL: "http://localhost:3000",
				advanced: {
					crossOriginCookies: {
						enabled: true,
						allowLocalhostUnsecure: true,
					},
					defaultCookieAttributes: {
						sameSite: "none",
						secure: false,
					},
				},
				plugins: [lastLoginMethod()],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("SameSite=None");
					// Should not contain Secure on localhost when allowLocalhostUnsecure is true
					expect(setCookie).not.toContain("Secure");
					expect(setCookie).toContain(
						"better-auth.last_used_login_method=email",
					);
				},
			},
		);
	});
});
