import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { multiSession } from ".";
import { multiSessionClient } from "./client";
import { parseSetCookieHeader } from "../../cookies";

describe("multi-session", async () => {
	const { auth, client, signInWithTestUser, testUser } = await getTestInstance(
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
		"postgres",
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
						`better-auth.session_token_multi-${sessionToken}`,
					)?.value;
					expect(sessionToken).not.toBe(null);
					expect(multiSession).not.toBe(null);
					expect(multiSession).toContain(sessionToken);
					expect(setCookieString).toContain("better-auth.session_token_multi-");
					headers.set("cookie", `${setCookieString?.split(",").join(";")}`);
				},
			},
		);
		await client.signUp.email(testUser2, {
			onSuccess(context) {
				const setCookieString = context.response.headers.get("set-cookie");
				headers.set(
					"cookie",
					`${headers.get("cookie")}; ${setCookieString?.split(",").join(";")}`,
				);
			},
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

	let sessionId = "";
	it("should list all device sessions", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		if (res.data) {
			sessionId =
				res.data.find((s) => s.user.email === testUser.email)?.session.id || "";
		}
		expect(res.data).toHaveLength(2);
	});

	it("should set active session", async () => {
		const res = await client.multiSession.setActive({
			sessionId,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.user.email).toBe(testUser.email);
	});

	it("should sign-out a session", async () => {
		await client.multiSession.revoke({
			fetchOptions: {
				headers,
			},
			sessionId,
		});
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(1);
	});

	it("should sign-out all sessions", async () => {
		await client.signOut({
			fetchOptions: {
				headers,
			},
		});

		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(0);
	});
});
