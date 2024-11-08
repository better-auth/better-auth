import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { username } from ".";
import { usernameClient } from "./client";

describe("username", async (it) => {
	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [username()],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);

	it("should signup with username", async () => {
		const res = await client.signUp.email({
			email: "new-email@gamil.com",
			username: "new-username",
			password: "new-password",
			name: "new-name",
		});
		expect(res.data?.user.username).toBe("new-username");
	});
	const headers = new Headers();
	it("should sign-in with username", async () => {
		const res = await client.signIn.username(
			{
				username: "new-username",
				password: "new-password",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		expect(res.data?.session).toBeDefined();
	});
	it("should update username", async () => {
		const res = await client.updateUser({
			username: "new-username-2",
			fetchOptions: {
				headers,
			},
		});

		expect(res.data?.user.username).toBe("new-username-2");
	});
});
