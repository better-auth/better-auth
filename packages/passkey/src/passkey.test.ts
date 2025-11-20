import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import type { Passkey } from ".";
import { passkey } from ".";
import { passkeyClient } from "./client";

describe("passkey", async () => {
	const { auth, signInWithTestUser, customFetchImpl } = await getTestInstance({
		plugins: [passkey()],
	});

	it("should generate register options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await auth.api.generatePasskeyRegistrationOptions({
			headers: headers,
		});

		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rp");
		expect(options).toHaveProperty("user");
		expect(options).toHaveProperty("pubKeyCredParams");

		const client = createAuthClient({
			plugins: [passkeyClient()],
			baseURL: "http://localhost:3000/api/auth",
			fetchOptions: {
				headers: headers,
				customFetchImpl,
			},
		});

		await client.$fetch("/passkey/generate-register-options", {
			headers: headers,
			method: "GET",
			onResponse(context) {
				const setCookie = context.response.headers.get("Set-Cookie");
				expect(setCookie).toBeDefined();
				expect(setCookie).toContain("better-auth-passkey");
			},
		});
	});

	it("should generate authenticate options", async () => {
		const { headers } = await signInWithTestUser();
		const options = await auth.api.generatePasskeyAuthenticationOptions({
			headers: headers,
		});
		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rpId");
		expect(options).toHaveProperty("allowCredentials");
		expect(options).toHaveProperty("userVerification");
	});

	it("should generate authenticate options without session (discoverable credentials)", async () => {
		// Test without any session/auth headers - simulating a new sign-in with discoverable credentials
		const options = await auth.api.generatePasskeyAuthenticationOptions({});
		expect(options).toBeDefined();
		expect(options).toHaveProperty("challenge");
		expect(options).toHaveProperty("rpId");
		expect(options).toHaveProperty("userVerification");
	});

	it("should list user passkeys", async () => {
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		await context.adapter.create<Omit<Passkey, "id">, Passkey>({
			model: "passkey",
			data: {
				userId: user.id,
				publicKey: "mockPublicKey",
				name: "mockName",
				counter: 0,
				deviceType: "singleDevice",
				credentialID: "mockCredentialID",
				createdAt: new Date(),
				backedUp: false,
				transports: "mockTransports",
				aaguid: "mockAAGUID",
			} satisfies Omit<Passkey, "id">,
		});

		const passkeys = await auth.api.listPasskeys({
			headers: headers,
		});

		expect(Array.isArray(passkeys)).toBe(true);
		expect(passkeys[0]).toHaveProperty("id");
		expect(passkeys[0]).toHaveProperty("userId");
		expect(passkeys[0]).toHaveProperty("publicKey");
		expect(passkeys[0]).toHaveProperty("credentialID");
		expect(passkeys[0]).toHaveProperty("aaguid");
	});

	it("should update a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const passkeys = await auth.api.listPasskeys({
			headers: headers,
		});
		const passkey = passkeys[0]!;
		const updateResult = await auth.api.updatePasskey({
			headers: headers,
			body: {
				id: passkey.id,
				name: "newName",
			},
		});

		expect(updateResult.passkey.name).toBe("newName");
	});

	it("should delete a passkey", async () => {
		const { headers } = await signInWithTestUser();
		const passkeys = await auth.api.listPasskeys({
			headers: headers,
		});
		const passkey = passkeys[0]!;
		const deleteResult = await auth.api.deletePasskey({
			headers: headers,
			body: {
				id: passkey.id,
			},
		});
		expect(deleteResult).toBe(null);

		// Verify the passkey was actually deleted
		const passkeysAfter = await auth.api.listPasskeys({
			headers: headers,
		});
		expect(passkeysAfter.length).toBe(passkeys.length - 1);
	});

	it("should not delete a passkey that doesn't exist", async () => {
		const { headers } = await signInWithTestUser();
		const deleteResult = await auth.api.deletePasskey({
			headers: headers,
			body: {
				id: "non-existent-passkey-id",
			},
		});
		expect(deleteResult).toBe(null);
	});

	it("should not delete a passkey belonging to another user", async () => {
		// Create a passkey for user 1
		const { headers: headers1, user: user1 } = await signInWithTestUser();
		const context = await auth.$context;
		const passkey1 = await context.adapter.create<Omit<Passkey, "id">, Passkey>(
			{
				model: "passkey",
				data: {
					userId: user1.id,
					publicKey: "user1PublicKey",
					name: "user1Passkey",
					counter: 0,
					deviceType: "singleDevice",
					credentialID: "user1CredentialID",
					createdAt: new Date(),
					backedUp: false,
					transports: "mockTransports",
					aaguid: "mockAAGUID",
				} satisfies Omit<Passkey, "id">,
			},
		);

		// Create and sign in a second user using the API
		const user2Email = "user2@test.com";
		const user2Password = "password123";

		// Sign up user 2
		await auth.api.signUpEmail({
			body: {
				email: user2Email,
				password: user2Password,
				name: "User 2",
			},
		});

		// Sign in user 2 to get session headers
		const signInResponse = await auth.api.signInEmail({
			body: {
				email: user2Email,
				password: user2Password,
			},
			asResponse: true,
		});

		// Extract session cookie from the Set-Cookie header
		const setCookie = signInResponse.headers.get("set-cookie");
		const cookies = parseSetCookieHeader(setCookie || "");
		const sessionToken = cookies.get("better-auth.session_token")?.value;

		const headers2 = new Headers();
		headers2.set("cookie", `better-auth.session_token=${sessionToken}`);

		// Get user2 info for verification
		const user2Session = await auth.api.getSession({
			headers: headers2,
		});

		// Ensure we have two different users
		expect(user1.id).not.toBe(user2Session?.user.id);

		// Try to delete user 1's passkey as user 2
		// The endpoint returns success but doesn't delete the passkey
		// This is safer as it prevents information disclosure about passkey ownership
		const deleteResult = await auth.api.deletePasskey({
			headers: headers2,
			body: {
				id: passkey1.id,
			},
		});
		expect(deleteResult).toBe(null);

		// Verify the passkey still exists (wasn't actually deleted)
		const passkeyStillExists = await context.adapter.findOne<Passkey>({
			model: "passkey",
			where: [{ field: "id", value: passkey1.id }],
		});
		expect(passkeyStillExists).toBeDefined();
		expect(passkeyStillExists?.id).toBe(passkey1.id);
	});
});
