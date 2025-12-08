import { getTestInstance } from "../../../packages/better-auth/src/test-utils/test-instance";
import { createAuthClient } from "../../../packages/better-auth/src/client";
import { organizationClient } from "../../../packages/better-auth/src/plugins/organization/client";
import { organization } from "../../../packages/better-auth/src/plugins/organization";
import { createAccessControl } from "../../../packages/better-auth/src/plugins/access";
import { defaultStatements, ownerAc, adminAc, memberAc } from "../../../packages/better-auth/src/plugins/organization/access";
import { describe, expect, it, beforeAll } from "vitest";

describe("organization custom resources integration", async () => {
	const ac = createAccessControl({
		...defaultStatements,
	});
	const owner = ac.newRole({
		...ownerAc.statements,
	});
	const admin = ac.newRole({
		...adminAc.statements,
	});
	const member = ac.newRole({
		...memberAc.statements,
	});

	const { auth, customFetchImpl, signInWithTestUser } = await getTestInstance({
		plugins: [
			organization({
				ac,
				roles: {
					owner,
					admin,
					member,
				},
				dynamicAccessControl: {
					enabled: true,
					enableCustomResources: true,
					maximumResourcesPerOrganization: 10,
				},
			}),
		],
	});

	const authClient = createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [
			organizationClient({
				ac,
				roles: {
					owner,
					admin,
					member,
				},
				dynamicAccessControl: {
					enabled: true,
					enableCustomResources: true,
				},
			}),
		],
		fetchOptions: {
			customFetchImpl,
		},
	});

	const { headers, user } = await signInWithTestUser();

	let organizationId: string;

	beforeAll(async () => {
		// Create an organization for testing
		const org = await authClient.organization.create(
			{
				name: "Test Organization",
				slug: "test-org-resources",
			},
			{
				headers,
			},
		);
		organizationId = org.data!.id;
	});

	it("should create a custom resource", async () => {
		const result = await authClient.organization.createOrgResource(
			{
				organizationId,
				resource: "project",
				permissions: ["create", "read", "update", "delete", "archive"],
			},
			{
				headers,
			},
		);

		expect(result.data?.success).toBe(true);
		expect(result.data?.resource.resource).toBe("project");
		expect(result.data?.resource.permissions).toEqual([
			"create",
			"read",
			"update",
			"delete",
			"archive",
		]);
		expect(result.data?.resource.organizationId).toBe(organizationId);
	});

	it("should list all resources including default and custom", async () => {
		const result = await authClient.organization.listOrgResources(
			{
				organizationId,
			},
			{
				headers,
			},
		);

		expect(result.data?.resources).toBeDefined();
		const resources = result.data!.resources;

		// Should have default resources
		const orgResource = resources.find((r) => r.resource === "organization");
		expect(orgResource).toBeDefined();
		expect(orgResource?.isProtected).toBe(true);
		expect(orgResource?.isCustom).toBe(false);

		// Should have custom resource
		const projectResource = resources.find((r) => r.resource === "project");
		expect(projectResource).toBeDefined();
		expect(projectResource?.isProtected).toBe(false);
		expect(projectResource?.isCustom).toBe(true);
	});

	it("should get a specific custom resource", async () => {
		const result = await authClient.organization.getOrgResource(
			{
				organizationId,
				resource: "project",
			},
			{
				headers,
			},
		);

		expect(result.data?.resource.resource).toBe("project");
		expect(result.data?.resource.permissions).toEqual([
			"create",
			"read",
			"update",
			"delete",
			"archive",
		]);
		expect(result.data?.resource.isCustom).toBe(true);
	});

	it("should update a custom resource permissions", async () => {
		const result = await authClient.organization.updateOrgResource(
			{
				organizationId,
				resource: "project",
				permissions: ["read", "write", "delete"],
			},
			{
				headers,
			},
		);

		expect(result.data?.success).toBe(true);
		expect(result.data?.resource.permissions).toEqual([
			"read",
			"write",
			"delete",
		]);
	});

	it("should create a role using custom resource", async () => {
		const result = await authClient.organization.createOrgRole(
			{
				organizationId,
				role: "project_manager",
				permission: {
					project: ["read", "write"],
					member: ["read"],
				},
			},
			{
				headers,
			},
		);

		expect(result.data?.success).toBe(true);
		expect(result.data?.roleData.role).toBe("project_manager");
	});

	it("should auto-create resources when creating a role with non-existent resources", async () => {
		// Create a role with a resource that doesn't exist yet
		const result = await authClient.organization.createOrgRole(
			{
				organizationId,
				role: "task_manager",
				permission: {
					task: ["create", "read", "update", "complete"], // "task" doesn't exist yet
					project: ["read"], // "project" exists from previous test
				},
			},
			{
				headers,
			},
		);

		expect(result.data?.success).toBe(true);
		expect(result.data?.roleData.role).toBe("task_manager");

		// Verify the "task" resource was auto-created
		const resourceResult = await authClient.organization.getOrgResource(
			{
				organizationId,
				resource: "task",
			},
			{
				headers,
			},
		);

		expect(resourceResult.data?.resource.resource).toBe("task");
		expect(resourceResult.data?.resource.permissions).toEqual([
			"create",
			"read",
			"update",
			"complete",
		]);
		expect(resourceResult.data?.resource.isCustom).toBe(true);
	});

	it("should prevent deleting resource that is in use by roles", async () => {
		const result = await authClient.organization.deleteOrgResource(
			{
				organizationId,
				resource: "project",
			},
			{
				headers,
				onError: (ctx) => {
					return ctx.response;
				},
			},
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("in use");
	});

	it("should delete a role first, then delete the custom resource", async () => {
		// Delete the role first
		const deleteRoleResult = await authClient.organization.deleteOrgRole(
			{
				organizationId,
				roleName: "project_manager",
			},
			{
				headers,
			},
		);
		expect(deleteRoleResult.data?.success).toBe(true);

		// Now delete the resource
		const deleteResourceResult =
			await authClient.organization.deleteOrgResource(
				{
					organizationId,
					resource: "project",
				},
				{
					headers,
				},
			);

		expect(deleteResourceResult.data?.success).toBe(true);
	});

	it("should reject invalid resource names", async () => {
		const testCases = [
			{ name: "Invalid-Name", reason: "contains dash" },
			{ name: "Invalid Name", reason: "contains space" },
			{ name: "InvalidName", reason: "contains uppercase" },
			{ name: "", reason: "empty" },
		];

		for (const { name } of testCases) {
			const result = await authClient.organization.createOrgResource(
				{
					organizationId,
					resource: name,
					permissions: ["read"],
				},
				{
					headers,
					onError: (ctx) => {
						return ctx.response;
					},
				},
			);

			expect(result.error).toBeDefined();
		}
	});

	it("should reject reserved resource names", async () => {
		const reservedNames = ["organization", "member", "invitation", "team", "ac"];

		for (const name of reservedNames) {
			const result = await authClient.organization.createOrgResource(
				{
					organizationId,
					resource: name,
					permissions: ["read"],
				},
				{
					headers,
					onError: (ctx) => {
						return ctx.response;
					},
				},
			);

			expect(result.error).toBeDefined();
			expect(result.error?.message).toContain("reserved");
		}
	});

	it("should enforce maximum resources limit", async () => {
		// Create resources up to the limit (10 total, already have defaults)
		const customResourceCount = 10;
		for (let i = 0; i < customResourceCount; i++) {
			await authClient.organization.createOrgResource(
				{
					organizationId,
					resource: `resource_${i}`,
					permissions: ["read"],
				},
				{
					headers,
					onError: (ctx) => {
						return ctx.response;
					},
				},
			);
		}

		// Try to create one more, should fail
		const result = await authClient.organization.createOrgResource(
			{
				organizationId,
				resource: "over_limit",
				permissions: ["read"],
			},
			{
				headers,
				onError: (ctx) => {
					return ctx.response;
				},
			},
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("too many");
	});

	it("should prevent updating reserved resources", async () => {
		const result = await authClient.organization.updateOrgResource(
			{
				organizationId,
				resource: "organization",
				permissions: ["custom_permission"],
			},
			{
				headers,
				onError: (ctx) => {
					return ctx.response;
				},
			},
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("reserved");
	});

	it("should check permissions when creating resources", async () => {
		// Create a member user
		const { headers: memberHeaders } = await signInWithTestUser();

		// Add member to organization
		await auth.api.addMember({
			body: {
				userId: (
					await authClient.getSession({
						headers: memberHeaders,
					})
				).data?.user.id!,
				organizationId,
				role: "member",
			},
		});

		// Set active organization for member
		await authClient.organization.setActive(
			{
				organizationId,
			},
			{
				headers: memberHeaders,
			},
		);

		// Member should not be able to create resources (no ac:create permission)
		const result = await authClient.organization.createOrgResource(
			{
				resource: "unauthorized_resource",
				permissions: ["read"],
			},
			{
				headers: memberHeaders,
				onError: (ctx) => {
					return ctx.response;
				},
			},
		);

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain("not allowed");
	});
});

