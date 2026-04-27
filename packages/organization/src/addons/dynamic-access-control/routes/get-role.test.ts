import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, expectTypeOf } from "vitest";
import { organizationClient } from "../../../client";
import { organization } from "../../../organization";
import { getOrganizationData } from "../../../test/utils";
import { dynamicAccessControl } from "..";
import { getRoleData } from "../tests/utils";

async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

describe("get-role", async (it) => {
	const { signInWithTestUser, auth } = await defineInstance([
		organization({ use: [dynamicAccessControl()] }),
	]);

	it("should get a role by ID", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const role = await auth.api.getRole({
			query: {
				roleId: createdRole.id,
				organizationId: org.id,
			},
			headers,
		});

		expect(role.id).toBe(createdRole.id);
		expect(role.role).toBe(roleData.role);
		expect(role.permissions).toEqual(roleData.permissions);
		expectTypeOf(role).toEqualTypeOf<{
			id: string;
			role: string;
			organizationId: string;
			permissions: Record<string, string[]>;
			createdAt: Date;
			updatedAt?: Date | undefined;
		}>();
	});

	it("should get a role by name", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id, role: "my-role" });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		const role = await auth.api.getRole({
			query: {
				roleName: "my-role",
				organizationId: org.id,
			},
			headers,
		});

		expect(role.id).toBe(createdRole.id);
		expect(role.role).toBe("my-role");
	});

	it("should return error when role does not exist", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.getRole({
				query: {
					roleId: "non-existent-role-id",
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should return error when neither roleId nor roleName is provided", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		await expect(
			auth.api.getRole({
				query: {
					organizationId: org.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});

	it("should not return a role from a different organization", async () => {
		const { headers } = await signInWithTestUser();

		const orgData1 = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			body: orgData1,
			headers,
		});

		const orgData2 = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			body: orgData2,
			headers,
		});

		const roleData = getRoleData({ organizationId: org1.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		await expect(
			auth.api.getRole({
				query: {
					roleId: createdRole.id,
					organizationId: org2.id,
				},
				headers,
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Unauthenticated requests should be rejected
	 */
	it("should reject unauthenticated requests", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers,
		});

		await expect(
			auth.api.getRole({
				query: {
					roleId: createdRole.id,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow();
	});

	/**
	 * Security test: Non-members should not be able to read roles
	 */
	it("should reject requests from non-members of the organization", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: orgData,
			headers: ownerHeaders,
		});

		const roleData = getRoleData({ organizationId: org.id });
		const createdRole = await auth.api.createRole({
			body: roleData,
			headers: ownerHeaders,
		});

		// Create a separate user who is not a member of the organization
		const otherUser = await auth.api.signUpEmail({
			body: {
				email: `non-member-get-role-${Date.now()}@example.com`,
				password: "password123",
				name: "Non Member User",
			},
			returnHeaders: true,
		});
		const otherHeaders = {
			cookie: otherUser.headers.getSetCookie()[0]!,
		};

		await expect(
			auth.api.getRole({
				query: {
					roleId: createdRole.id,
					organizationId: org.id,
				},
				headers: otherHeaders,
			}),
		).rejects.toThrow();
	});
});
