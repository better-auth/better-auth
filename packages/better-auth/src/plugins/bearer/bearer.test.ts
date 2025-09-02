import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("bearer", async () => {
	const { client, auth, testUser } = await getTestInstance(
		{},
		{
			disableTestUser: true,
		},
	);

	let token: string;
	it("should get session", async () => {
		await client.signUp.email(
			{
				email: testUser.email,
				password: testUser.password,
				name: testUser.name,
			},
			{
				onSuccess: (ctx) => {
					token = ctx.response.headers.get("set-auth-token") || "";
				},
			},
		);
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should list session", async () => {
		const sessions = await client.listSessions({
			fetchOptions: {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			},
		});
		expect(sessions.data).toHaveLength(1);
	});

	it("should work on server actions", async () => {
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${token}`,
			}),
		});
		expect(session?.session).toBeDefined();
	});

	it("should work with ", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					authorization: `Bearer ${token.split(".")[0]}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});

	it("should work if valid cookie is provided even if authorization header isn't valid", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers: {
					Authorization: `Bearer invalid.token`,
					cookie: `better-auth.session_token=${token}`,
				},
			},
		});
		expect(session.data?.session).toBeDefined();
	});
});
