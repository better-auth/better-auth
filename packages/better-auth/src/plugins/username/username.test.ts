import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { username } from ".";
import { usernameClient } from "./client";

describe("username", async (it) => {
	const { client, sessionSetter, signInWithTestUser } = await getTestInstance(
		{
			plugins: [
				username({
					minUsernameLength: 4,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);

	it("should sign up with username", async () => {
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "new-email@gamil.com",
				username: "new_username",
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
		expect(session?.user.username).toBe("new_username");
	});
	const headers = new Headers();
	it("should sign-in with username", async () => {
		const res = await client.signIn.username(
			{
				username: "new_username",
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
			username: "new_username_2.1",
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
		expect(session?.user.username).toBe("new_username_2.1");
	});

	it("should fail on duplicate username in sign-up", async () => {
		const res = await client.signUp.email({
			email: "new-email-2@gamil.com",
			username: "New_username_2.1",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(422);
	});

	it("should fail on duplicate username in update-user if user is different", async () => {
		const newHeaders = new Headers();
		await client.signUp.email({
			email: "new-email-2@gamil.com",
			username: "duplicate-username",
			password: "new_password",
			name: "new-name",
			fetchOptions: {
				headers: newHeaders,
			},
		});

		const { headers: testUserHeaders } = await signInWithTestUser();
		const res = await client.updateUser({
			username: "duplicate-username",
			fetchOptions: {
				headers: testUserHeaders,
			},
		});
		expect(res.error?.status).toBe(422);
	});

	it("should succeed on duplicate username in update-user if user is the same", async () => {
		await client.updateUser({
			username: "New_username_2.1",
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
		expect(session?.user.username).toBe("new_username_2.1");
	});

	it("should fail on invalid username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "new username",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_IS_INVALID");
	});

	it("should fail on too short username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "new",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_IS_TOO_SHORT");
	});

	it("should fail on empty username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(422);
	});
});
