import { describe, expect, it } from "vitest";
import { bearer } from ".";
import { getTestInstance } from "../../test-utils/test-instance";

describe("bearer", async () => {
	const { client, signInWithTestUser, auth } = await getTestInstance({
		plugins: [bearer()],
	});

	let token: string;
	let encryptedToken: string | undefined;
	it("should get session", async () => {
		const { res, headers } = await signInWithTestUser();
		token = res.data?.session.token || "";
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		});
		encryptedToken = headers
			.get("cookie")
			?.split("better-auth.session_token=")[1];
		expect(session.data?.session.token).toBe(res.data?.session.token);
	});

	it("should list session", async () => {
		const sessions = await client.listSessions({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		});
		expect(sessions.data).toHaveLength(2);
	});

	it("should work on server actions", async () => {
		const { res } = await signInWithTestUser();
		token = res.data?.session.token || "";
		const headers = new Headers();
		headers.set("authorization", `Bearer ${token}`);
		const session = await auth.api.getSession({
			headers,
		});
		expect(session?.session.token).toBe(token);
	});

	it("should work with encrypted token", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${encryptedToken}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});
});
