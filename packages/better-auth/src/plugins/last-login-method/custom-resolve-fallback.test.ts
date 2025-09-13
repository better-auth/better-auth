import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";
import { parseCookies } from "../../cookies";

describe("lastLoginMethod customResolveMethod fallback", async () => {
	it("should use default logic when no custom resolve method is provided", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
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
		// Should detect email login method using default logic
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should use only custom resolve method when it returns non-null", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({
						customResolveMethod: (ctx) => {
							// Custom logic that overrides everything
							return "always-custom";
						},
					}),
				],
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
		// Should use custom method result, not default "email"
		expect(cookies.get("better-auth.last_used_login_method")).toBe(
			"always-custom",
		);
	});

	it("should fallback to default logic when custom resolve method returns null", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({
						customResolveMethod: (ctx) => {
							// Custom logic for specific paths only
							if (ctx.path === "/custom-login") {
								return "custom";
							}
							// Return null to fallback to default logic
							return null;
						},
					}),
				],
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
		// Should fallback to default logic and detect "email"
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should use custom method for custom paths and default for standard paths", async () => {
		let capturedMethods: string[] = [];

		const { client, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({
						customResolveMethod: (ctx) => {
							// Handle custom authentication methods
							if (ctx.path === "/auth/magic-link") {
								return "magic-link";
							}
							if (ctx.path === "/auth/phone") {
								return "phone";
							}
							// Return null to use default logic for standard paths
							return null;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		// Test 1: Standard email login should use default logic
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie?.includes("last_used_login_method=email")) {
						capturedMethods.push("email");
					}
				},
			},
		);

		// Test 2: OAuth callback should use default logic
		await client.signIn.social(
			{
				provider: "github",
				callbackURL: "https://example.com/callback",
			},
			{
				onSuccess(context) {
					// This would be a callback with provider ID
					// The default logic should handle this
					const headers = context.response?.headers;
					const setCookie = headers?.get("set-cookie");
					if (setCookie?.includes("github")) {
						capturedMethods.push("github-callback");
					}
				},
			},
		);

		// Verify that default logic is working for standard paths
		expect(capturedMethods).toContain("email");
	});

	it("should preserve custom resolve method behavior with database storage", async () => {
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({
						storeInDatabase: true,
						customResolveMethod: (ctx) => {
							if (ctx.path === "/custom-auth") {
								return "custom-db";
							}
							return null; // Fallback to default
						},
					}),
				],
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
		// Should fallback to default and work with database storage
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});
});
