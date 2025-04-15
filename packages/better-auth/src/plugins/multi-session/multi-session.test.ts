import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { multiSession } from ".";
import { multiSessionClient } from "./client";
import { parseSetCookieHeader } from "../../cookies";

describe("multi-session", async () => {
	const { client, testUser, cookieSetter } = await getTestInstance(
		{
			plugins: [
				multiSession({
					maximumSessions: 2,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [multiSessionClient()],
			},
		},
	);

	let headers = new Headers();
	const testUser2 = {
		email: "second-email@test.com",
		password: "password",
		name: "Name",
	};

	it("should set multi session when there is set-cookie header", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookieString = context.response.headers.get("set-cookie");
					const setCookies = parseSetCookieHeader(setCookieString || "");
					const sessionToken = setCookies
						.get("better-auth.session_token")
						?.value.split(".")[0];
					const multiSession = setCookies.get(
						`better-auth.session_token_multi-${sessionToken?.toLowerCase()}`,
					)?.value;
					expect(sessionToken).not.toBe(null);
					expect(multiSession).not.toBe(null);
					expect(multiSession).toContain(sessionToken);
					expect(setCookieString).toContain("better-auth.session_token_multi-");
				},
				onSuccess: cookieSetter(headers),
			},
		);
		await client.signUp.email(testUser2, {
			onSuccess: cookieSetter(headers),
		});
	});

	it("should get active session", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.email).toBe(testUser2.email);
	});

	let sessionToken = "";
	it("should list all device sessions", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		if (res.data) {
			sessionToken =
				res.data.find((s) => s.user.email === testUser.email)?.session.token ||
				"";
		}
		expect(res.data).toHaveLength(2);
	});

	it("should set active session", async () => {
		const res = await client.multiSession.setActive({
			sessionToken,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.user.email).toBe(testUser.email);
	});

	it("should revoke a session and set the next active", async () => {
		const testUser3 = {
			email: "my-email@email.com",
			password: "password",
			name: "Name",
		};
		let token = "";
		const signUpRes = await client.signUp.email(testUser3, {
			onSuccess: (ctx) => {
				const header = ctx.response.headers.get("set-cookie");
				expect(header).toContain("better-auth.session_token");
				const cookies = parseSetCookieHeader(header || "");
				token =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
			},
		});
		await client.multiSession.revoke(
			{
				sessionToken: token,
			},
			{
				onSuccess(context) {
					expect(context.response.headers.get("set-cookie")).toContain(
						`better-auth.session_token=`,
					);
				},
				headers,
			},
		);
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(2);
	});

	it("should sign-out all sessions", async () => {
		const newHeaders = new Headers();
		await client.signOut({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(newHeaders),
			},
		});
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(0);
		const res2 = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(res2.data).toHaveLength(0);
	});
});
