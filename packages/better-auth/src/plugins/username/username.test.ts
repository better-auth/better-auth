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
		expect(res.error?.status).toBe(400);
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

	it("should preserve both username and displayUsername when updating both", async () => {
		const updateRes = await client.updateUser({
			username: "priority_user",
			displayUsername: "Priority Display Name",
			fetchOptions: {
				headers,
			},
		});

		expect(updateRes.error).toBeNull();

		const session = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});

		expect(session?.user.username).toBe("priority_user");
		expect(session?.user.displayUsername).toBe("Priority Display Name");
	});

	it("should fail on invalid username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "new username",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("USERNAME_IS_INVALID");
	});

	it("should fail on too short username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "new",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("USERNAME_TOO_SHORT");
	});

	it("should fail on empty username", async () => {
		const res = await client.signUp.email({
			email: "email-4@email.com",
			username: "",
			password: "new_password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(400);
	});

	it("should check if username is unavailable", async () => {
		const res = await client.isUsernameAvailable({
			username: "priority_user",
		});
		expect(res.data?.available).toEqual(false);
	});

	it("should check if username is unavailable with different case (normalization)", async () => {
		const res = await client.isUsernameAvailable({
			username: "PRIORITY_USER",
		});
		expect(res.data?.available).toEqual(false);
	});

	it("should check if username is available", async () => {
		const res = await client.isUsernameAvailable({
			username: "new_username_2.2",
		});
		expect(res.data?.available).toEqual(true);
	});

	it("should reject invalid username format in isUsernameAvailable", async () => {
		const res = await client.isUsernameAvailable({
			username: "invalid username!",
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_IS_INVALID");
	});

	it("should reject too short username in isUsernameAvailable", async () => {
		const res = await client.isUsernameAvailable({
			username: "abc",
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_TOO_SHORT");
	});

	it("should reject too long username in isUsernameAvailable", async () => {
		const longUsername = "a".repeat(31);
		const res = await client.isUsernameAvailable({
			username: longUsername,
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_IS_TOO_LONG");
	});

	it("should not normalize displayUsername", async () => {
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "display-test@email.com",
				displayUsername: "Test Username",
				password: "test-password",
				name: "test-name",
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

		expect(session?.user.username).toBe("test username");
		expect(session?.user.displayUsername).toBe("Test Username");
	});

	it("should preserve both username and displayUsername when both are provided", async () => {
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "both-fields@email.com",
				username: "custom_user",
				displayUsername: "Fancy Display Name",
				password: "test-password",
				name: "test-name",
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

		expect(session?.user.username).toBe("custom_user");
		expect(session?.user.displayUsername).toBe("Fancy Display Name");
	});

	it("should sign in with normalized username", async () => {
		const { client } = await getTestInstance(
			{
				plugins: [username()],
			},
			{
				clientOptions: {
					plugins: [usernameClient()],
				},
			},
		);
		await client.signUp.email({
			email: "normalized-username@email.com",
			username: "Custom_User",
			password: "test-password",
			name: "test-name",
		});
		const res2 = await client.signIn.username({
			username: "Custom_User",
			password: "test-password",
		});
		expect(res2.data?.user.username).toBe("custom_user");
		expect(res2.data?.user.displayUsername).toBe("Custom_User");
	});
});

describe("username custom normalization", async (it) => {
	const { client } = await getTestInstance(
		{
			plugins: [
				username({
					minUsernameLength: 4,
					usernameNormalization: (username) =>
						username.replaceAll("0", "o").replaceAll("4", "a").toLowerCase(),
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
		const res = await client.signUp.email({
			email: "new-email@gamil.com",
			username: "H4XX0R",
			password: "new-password",
			name: "new-name",
		});
		expect(res.error).toBeNull();
	});

	it("should fail on duplicate username", async () => {
		const res = await client.signUp.email({
			email: "new-email-2@gamil.com",
			username: "haxxor",
			password: "new-password",
			name: "new-name",
		});
		expect(res.error?.status).toBe(400);
	});

	it("should normalize displayUsername", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				username({
					displayUsernameNormalization: (displayUsername) =>
						displayUsername.toLowerCase(),
				}),
			],
		});
		const res = await auth.api.signUpEmail({
			body: {
				email: "new-email-3@gmail.com",
				password: "new-password",
				name: "new-name",
				username: "test_username",
				displayUsername: "Test Username",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session?.user.username).toBe("test_username");
		expect(session?.user.displayUsername).toBe("test username");
	});
});

describe("username with displayUsername validation", async (it) => {
	const { client, sessionSetter } = await getTestInstance(
		{
			plugins: [
				username({
					displayUsernameValidator: (displayUsername) =>
						/^[a-zA-Z0-9_-]+$/.test(displayUsername),
				}),
			],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);

	it("should accept valid displayUsername", async () => {
		const res = await client.signUp.email({
			email: "display-valid@email.com",
			displayUsername: "Valid_Display-123",
			password: "test-password",
			name: "test-name",
		});
		expect(res.error).toBeNull();
	});

	it("should reject invalid displayUsername", async () => {
		const res = await client.signUp.email({
			email: "display-invalid@email.com",
			displayUsername: "Invalid Display!",
			password: "test-password",
			name: "test-name",
		});
		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("DISPLAY_USERNAME_IS_INVALID");
	});

	it("should update displayUsername with valid value", async () => {
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "update-display@email.com",
				displayUsername: "Initial_Name",
				password: "test-password",
				name: "test-name",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		const sessionBefore = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(sessionBefore?.user.displayUsername).toBe("Initial_Name");
		expect(sessionBefore?.user.username).toBe("initial_name");

		const res = await client.updateUser({
			displayUsername: "Updated_Name-123",
			fetchOptions: {
				headers,
			},
		});

		expect(res.error).toBeNull();
		const sessionAfter = await client.getSession({
			fetchOptions: {
				headers,
				throw: true,
			},
		});
		expect(sessionAfter?.user.displayUsername).toBe("Updated_Name-123");
		expect(sessionAfter?.user.username).toBe("updated_name-123");
	});

	it("should reject invalid displayUsername on update", async () => {
		const headers = new Headers();
		await client.signUp.email(
			{
				email: "update-invalid@email.com",
				displayUsername: "Valid_Name",
				password: "test-password",
				name: "test-name",
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		const res = await client.updateUser({
			displayUsername: "Invalid Display!",
			fetchOptions: {
				headers,
			},
		});

		expect(res.error?.status).toBe(400);
		expect(res.error?.code).toBe("DISPLAY_USERNAME_IS_INVALID");
	});
});

describe("isUsernameAvailable with custom validator", async (it) => {
	const { client } = await getTestInstance(
		{
			plugins: [
				username({
					usernameValidator: async (username) => {
						return username.startsWith("user_");
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);

	it("should accept username with custom validator", async () => {
		const res = await client.isUsernameAvailable({
			username: "user_valid123",
		});
		expect(res.data?.available).toEqual(true);
	});

	it("should reject username that doesn't match custom validator", async () => {
		const res = await client.isUsernameAvailable({
			username: "invalid_user",
		});
		expect(res.error?.status).toBe(422);
		expect(res.error?.code).toBe("USERNAME_IS_INVALID");
	});
});

describe("post normalization flow", async (it) => {
	it("should set displayUsername to username if only username is provided", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				username({
					validationOrder: {
						username: "post-normalization",
						displayUsername: "post-normalization",
					},
					usernameNormalization: (username) => {
						return username.split(" ").join("_").toLowerCase();
					},
				}),
			],
		});
		const res = await auth.api.signUpEmail({
			body: {
				email: "test-username@email.com",
				username: "Test Username",
				password: "test-password",
				name: "test-name",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${res.token}`,
			}),
		});
		expect(session?.user.username).toBe("test_username");
		expect(session?.user.displayUsername).toBe("Test Username");
	});
});

describe("username email verification flow (no info leak)", async (it) => {
	const { client } = await getTestInstance(
		{
			emailAndPassword: { enabled: true, requireEmailVerification: true },
			plugins: [username()],
		},
		{
			clientOptions: {
				plugins: [usernameClient()],
			},
		},
	);

	it("returns INVALID_USERNAME_OR_PASSWORD for wrong password even if email is unverified", async () => {
		await client.signUp.email({
			email: "unverified-user@example.com",
			username: "unverified_user",
			password: "correct-password",
			name: "Unverified User",
		});

		const res = await client.signIn.username({
			username: "unverified_user",
			password: "wrong-password",
		});

		expect(res.error?.status).toBe(401);
		expect(res.error?.code).toBe("INVALID_USERNAME_OR_PASSWORD");
	});

	it("returns EMAIL_NOT_VERIFIED only after a correct password for an unverified user", async () => {
		const res = await client.signIn.username({
			username: "unverified_user",
			password: "correct-password",
		});

		expect(res.error?.status).toBe(403);
		expect(res.error?.code).toBe("EMAIL_NOT_VERIFIED");
	});
});
