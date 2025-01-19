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
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "new-email@gamil.com",
				username: "New-Username",
				password: "new-password",
				name: "new-name",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);
		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session?.user.username).toBe("new-username");
		expect(session?.user.displayUsername).toBe("New-Username");
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
		expect(res.data?.token).toBeDefined();
	});
	it("should update username", async () => {
		const res = await client.updateUser({
			username: "new-Username-2",
			fetchOptions: {
				headers,
			},
		});

		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(session?.user.username).toBe("new-username-2");
		expect(session?.user.displayUsername).toBe("new-Username-2");
	});

	it("should fail on duplicate username", async () => {
		const res = await client.signUp.email({
			email: "new-email-2@gamil.com",
			username: "New-username-2",
			password: "new-password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(422);
	});
});
