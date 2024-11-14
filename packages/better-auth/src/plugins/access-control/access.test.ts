import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { accessControl } from ".";
import { accessControlClient } from "./client";
import { createAuthClient } from "../../client";
import { organization } from "../organization";
import { organizationClient } from "../organization/client";

describe("base", async (it) => {
	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
		{
			plugins: [accessControl({})],
		},
		{
			clientOptions: {
				plugins: [accessControlClient()],
			},
		},
	);

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [accessControlClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const {
		res: { user },
	} = await signInWithTestUser();
	const role = await auth.api.createRole({
		body: {
			name: "admin",
			permissions: ["test", "test2"],
			scope: "global",
		},
	});

	expect(role.name).toBe("admin");

	it("should be able to assign a role in a server without check permission", async ({
		expect,
	}) => {
		const userRole = await auth.api.assignRoleById({
			body: {
				roleId: role.id,
				userId: user.id,
			},
		});
		expect(userRole.roleId).toBe(role.id);
	});

	it("should be able to return true on has permission", async ({ expect }) => {
		const { headers } = await signInWithTestUser();
		const res = await client.ac.hasPermission(
			{
				permission: "test",
				scope: "global",
			},
			{
				headers,
			},
		);
		expect(res.data?.hasPermission).toBe(true);
	});

	it("should be able to return false on has permission", async ({ expect }) => {
		const { headers } = await signInWithTestUser();
		const res = await client.ac.hasPermission(
			{
				permission: "wrong",
				scope: "global",
			},
			{
				headers,
			},
		);
		expect(res.data?.hasPermission).toBe(false);
	});

	it("should handle super permission", async ({ expect }) => {
		const newRole = await auth.api.createRole({
			body: {
				name: "super-admin",
				permissions: ["*"],
				scope: "global",
			},
		});
		await auth.api.assignRoleById({
			body: {
				roleId: newRole.id,
				userId: user.id,
			},
		});
		const { headers } = await signInWithTestUser();
		const { data } = await client.ac.hasPermission(
			{
				permission: "dont-matter",
				scope: "global",
			},
			{
				headers,
			},
		);
		expect(data?.hasPermission).toBe(true);
	});

	const newRole = await auth.api.createRole({
		body: {
			name: "admin-role",
			permissions: ["test1", "test2"],
			scope: "global",
		},
	});

	it("should add permission", async ({ expect }) => {
		const updatedRole = await auth.api.updateRolePermissions({
			body: {
				permissions: ["test3", "test4"],
				action: "append",
				roleId: newRole.id,
			},
		});
		expect(updatedRole.permissions).toContain("test3");
		expect(updatedRole.permissions).toContain("test4");
	});
	it("should remove permissions", async ({ expect }) => {
		const updatedRole = await auth.api.updateRolePermissions({
			body: {
				permissions: ["test3", "test4"],
				action: "remove",
				roleId: newRole.id,
			},
		});
		expect(updatedRole.permissions).not.toContain("test3");
		expect(updatedRole.permissions).not.toContain("test4");
	});
	it("should replace permissions", async ({ expect }) => {
		const updatedRole = await auth.api.updateRolePermissions({
			body: {
				permissions: ["test3", "test4"],
				action: "replace",
				roleId: newRole.id,
			},
		});
		expect(updatedRole.permissions).not.toContain("test1");
		expect(updatedRole.permissions).not.toContain("test2");
	});
});

describe("with organization plugin", async (it) => {
	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance(
		{
			plugins: [accessControl({}), organization()],
		},
		{
			clientOptions: {
				plugins: [accessControlClient()],
			},
		},
	);

	const client = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [accessControlClient(), organizationClient()],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const {
		res: { user },
	} = await signInWithTestUser();

	const org = await auth.api.createOrganization({
		body: {
			name: "test",
			slug: "test",
			userId: user.id,
		},
	});
	if (!org) throw new Error("Organization not created");

	const role = await auth.api.createRole({
		body: {
			name: org.members[0].role,
			permissions: ["test", "test2"],
			scope: org.id,
		},
	});

	expect(role.name).toBe("owner");

	it("should be able to assign a role in a server without check permission", async ({
		expect,
	}) => {
		const userRole = await auth.api.assignRoleByName({
			body: {
				userId: user.id,
				roleName: role.name,
				scope: org.id,
			},
		});
		expect(userRole.roleId).toBe(role.id);
	});

	it("should be able to return true on has permission", async ({ expect }) => {
		const { headers } = await signInWithTestUser();
		const res = await client.ac.hasPermission(
			{
				permission: "test",
				scope: "global",
			},
			{
				headers,
			},
		);
		expect(res.data?.hasPermission).toBe(false);
		const res2 = await client.ac.hasPermission(
			{
				permission: "test",
				scope: org.id,
			},
			{
				headers,
			},
		);
		expect(res2.data?.hasPermission).toBe(true);
	});

	it("should return permissions", async () => {
		const { headers } = await signInWithTestUser();
		const res = await client.ac.getPermissions(
			{
				query: {
					scope: org.id,
				},
			},
			{
				headers,
			},
		);
	});
});
