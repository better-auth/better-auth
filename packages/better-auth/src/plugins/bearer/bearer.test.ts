import { describe, expect, it } from "vitest";
import { bearer } from ".";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";

describe("bearer", async () => {
	const { client, signInWithTestUser, auth } = await getTestInstance({
		plugins: [bearer()],
	});

	let token: string;
	let encryptedToken: string | undefined;
	it("should get session", async () => {
		const { session: _session, headers } = await signInWithTestUser();
		token = headers.get("cookie")?.split("=")[1].split(".")[0] || "";
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		});
		encryptedToken = headers.get("cookie")?.split("=")[1] || "";
		expect(session.data?.session).toBeDefined();
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
		const { session: _session, headers } = await signInWithTestUser();
		token = headers.get("cookie")?.split("=")[1].split(".")[0] || "";
		headers.set("authorization", `Bearer ${token}`);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${token}`,
			}),
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
