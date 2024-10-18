import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { multiSession } from ".";
import { multiSessionClient } from "./client";
import { parseSetCookieHeader } from "../../cookies";

describe("multi-session", async () => {
	const { auth, client, signInWithTestUser, testUser } = await getTestInstance(
		{
			plugins: [multiSession()],
		},
		{
			clientOptions: {
				plugins: [multiSessionClient()],
			},
		},
	);

	let headers = new Headers();

	it("should set multi session when there is set-cookie header", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					headers = context.response.headers;
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
				},
			},
		);
	});

	it("should list all device sessions", async () => {
		const res = await client.session.listDeviceSessions();
	});
});
