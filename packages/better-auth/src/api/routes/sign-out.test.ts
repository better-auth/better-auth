import { describe, expect } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { createHeadersWithTenantId } from "../../test-utils/headers";

describe("sign-out", async (it) => {
	const { signInWithTestUser, client } = await getTestInstance();

	it("should sign out", async () => {
		const { headers } = await signInWithTestUser();
		const res = await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toMatchObject({
			success: true,
		});
	});
});

describe("sign-out multi-tenancy", async (it) => {
	const { client, auth } = await getTestInstance(
		{
			multiTenancy: {
				enabled: true,
			},
		},
		{
			disableTestUser: true,
		}
	);

	it("should sign out users in correct tenant only", async () => {
		// Create users in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email: "user1@test.com",
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email: "user2@test.com",
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Sign out tenant-1 user
		const signOutResult = await client.signOut({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(signOutResult.data).toMatchObject({
			success: true,
		});

		// Verify tenant-1 user is signed out
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1Session.data).toBeNull();

		// Verify tenant-2 user is still signed in
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.id).toBe(tenant2User.user.id);
	});

	it("should handle sign out with same email in different tenants", async () => {
		const email = "same@test.com";

		// Create users with same email in different tenants
		const tenant1User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User 1",
			},
			headers: createHeadersWithTenantId("tenant-1"),
		});

		const tenant2User = await auth.api.signUpEmail({
			body: {
				email,
				password: "password",
				name: "User 2",
			},
			headers: createHeadersWithTenantId("tenant-2"),
		});

		// Sign out tenant-1 user
		const tenant1SignOut = await client.signOut({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});

		expect(tenant1SignOut.data?.success).toBe(true);

		// Verify tenant-1 user is signed out
		const tenant1Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-1", {
					authorization: `Bearer ${tenant1User.token}`,
				}),
			},
		});
		expect(tenant1Session.data).toBeNull();

		// Verify tenant-2 user with same email is still signed in
		const tenant2Session = await client.getSession({
			fetchOptions: {
				headers: createHeadersWithTenantId("tenant-2", {
					authorization: `Bearer ${tenant2User.token}`,
				}),
			},
		});
		expect(tenant2Session.data?.user.email).toBe(email);
		expect(tenant2Session.data?.user.tenantId).toBe("tenant-2");
	});
});
