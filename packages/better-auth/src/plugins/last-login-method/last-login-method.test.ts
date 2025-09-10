import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";
import { parseCookies } from "../../cookies";

describe("lastLoginMethod", async () => {
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

	it("should set the last login method cookie", async () => {
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
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should set the last login method in the database", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});
		const data = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("email");
	});
});
