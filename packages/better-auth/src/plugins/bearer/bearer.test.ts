import { describe, expect, it } from "vitest";
import { bearer } from ".";
import { getTestInstance } from "../../test-utils/test-instance";

describe("bearer", async () => {
	const { client, signInWithTestUser } = await getTestInstance({
		plugins: [bearer()],
	});

	let token: string;
	it("should get session", async () => {
		const { res } = await signInWithTestUser();
		token = res.data?.session.id || "";

		const session = await client.session({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		});
		expect(session.data?.session.id).toBe(res.data?.session.id);
	});

	it("should list session", async () => {
		const sessions = await client.user.listSessions({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token}`,
				},
			},
		});
		expect(sessions.data).toHaveLength(2);
	});
});
