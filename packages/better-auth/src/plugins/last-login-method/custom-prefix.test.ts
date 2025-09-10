import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";
import { parseCookies } from "../../cookies";

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
					// Uses exact cookie name from config, not affected by cookiePrefix
					expect(setCookie).toContain(
						"better-auth.last_used_login_method=email",
					);
				},
			},
		);
	});
});
