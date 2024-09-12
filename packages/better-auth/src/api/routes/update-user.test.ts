import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

describe("updateUser", async () => {
	const { auth, client, testUser, sessionSetter } = await getTestInstance();
	const headers = new Headers();
	const session = await client.signIn.email({
		email: testUser.email,
		password: testUser.password,
		options: {
			onSuccess: sessionSetter(headers),
		},
	});
	if (!session) {
		throw new Error("No session");
	}

	it("should update the user's name", async () => {
		const updated = await client.user.update({
			name: "newName",
			options: {
				headers,
			},
		});
		expect(updated.data?.name).toBe("newName");
	});

	it("should update the user's password", async () => {
		const updated = await client.user.changePassword({
			newPassword: "newPassword",
			oldPassword: testUser.password,
			options: {
				headers,
			},
		});
		expect(updated).toBeDefined();
		const signInRes = await client.signIn.email({
			email: testUser.email,
			password: "newPassword",
		});
		expect(signInRes.data?.user).toBeDefined();
		const signInOldPassword = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		expect(signInOldPassword.data).toBeNull();
	});
});
