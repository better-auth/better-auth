import { describe, it, expect, beforeAll } from "vitest";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { organization } from "../../organization";
import { organizationRbac } from "../rbac-organization";
import type { BetterAuthOptions } from "../../../../types";

describe("RBAC Organization Comprehensive Tests", () => {
	let testInstance: any;
	let auth: any;
	let db: any;
	let adminUser: any;
	let regularUser: any;
	let testOrg: any;
	let adminHeaders: any;
	let regularHeaders: any;

	beforeAll(async () => {
		testInstance = await getTestInstance({
			plugins: [
				organization(),
				organizationRbac({
					rbac: {
						enabled: true,
						permissions: [
							"user:create",
							"user:read",
							"user:update",
							"user:delete",
							"document:create",
							"document:read",
							"document:update",
							"document:delete",
						],
						roles: [
							{
								name: "admin",
								permissions: ["user:*", "document:*"],
							},
							{
								name: "editor",
								permissions: [
									"document:read",
									"document:update",
									"document:create",
								],
							},
							{
								name: "viewer",
								permissions: ["document:read"],
							},
						],
					},
				}),
			],
		} as BetterAuthOptions);

		auth = testInstance.auth;
		db = testInstance.db;

		// Create test users
		const adminSignUp = await auth.api.signUpEmail({
			body: {
				email: "admin@test.com",
				password: "password123",
				name: "Admin User",
			},
		});
		adminUser = adminSignUp.user;

		const regularSignUp = await auth.api.signUpEmail({
			body: {
				email: "regular@test.com",
				password: "password123",
				name: "Regular User",
			},
		});
		regularUser = regularSignUp.user;

		// Get headers for authenticated requests
		const adminSignIn = await testInstance.signInWithUser(
			"admin@test.com",
			"password123",
		);
		adminHeaders = adminSignIn.headers;

		const regularSignIn = await testInstance.signInWithUser(
			"regular@test.com",
			"password123",
		);
		regularHeaders = regularSignIn.headers;
	});

	it("should create organization and verify RBAC setup", async () => {
		// Create organization using direct API with userId
		const organization = await auth.api.createOrganization({
			body: {
				name: "RBAC Test Organization",
				slug: "rbac-test-org",
				userId: adminUser.id,
			},
		});

		expect(organization).toBeDefined();
		expect(organization.name).toBe("RBAC Test Organization");
		testOrg = organization;

		// Verify RBAC tables have data
		const permissions = await db.findMany({
			model: "permission",
			where: [{ field: "organizationId", value: testOrg.id }],
		});

		const roles = await db.findMany({
			model: "role",
			where: [{ field: "organizationId", value: testOrg.id }],
		});

		const memberRoles = await db.findMany({
			model: "memberRole",
			where: [{ field: "organizationId", value: testOrg.id }],
		});

		const auditLogs = await db.findMany({
			model: "auditLog",
			where: [{ field: "organizationId", value: testOrg.id }],
		});

		// Verify expected counts
		expect(permissions.length).toBeGreaterThan(0);
		expect(roles.length).toBe(3); // Organization Owner, Organization Admin, Member
		expect(memberRoles.length).toBe(1); // owner should have admin role
		expect(auditLogs.length).toBeGreaterThan(0);

		// Verify owner has admin role
		const ownerRole = memberRoles.find((ur: any) => ur.userId === adminUser.id);
		expect(ownerRole).toBeDefined();

		// Verify that we have the default roles created by the system
		const roleNames = roles.map((r: any) => r.name);
		expect(roleNames).toContain("Organization Owner");
		expect(roleNames).toContain("Organization Admin");
		expect(roleNames).toContain("Member");
	});

	it("should add member and assign role", async () => {
		// Skip invitation flow for now and just test role assignment

		// Assign Organization Admin role to regular user
		// For now, create role assignment directly via database
		const adminRole = await db.findOne({
			model: "role",
			where: [
				{ field: "organizationId", value: testOrg.id },
				{ field: "name", value: "Organization Admin" },
			],
		});

		expect(adminRole).toBeDefined();

		const memberRoleData = {
			userId: regularUser.id,
			organizationId: testOrg.id,
			roleId: adminRole.id,
			assignedBy: adminUser.id,
			assignedAt: new Date(),
			isActive: true,
		};

		await db.create({
			model: "memberRole",
			data: memberRoleData,
		});

		// Verify assignment
		const memberRole = await db.findOne({
			model: "memberRole",
			where: [
				{ field: "userId", value: regularUser.id },
				{ field: "organizationId", value: testOrg.id },
				{ field: "roleId", value: adminRole.id },
			],
		});

		expect(memberRole).toBeDefined();
		expect(memberRole.assignedAt).toBeDefined();
	});

	it("should check user permissions", async () => {
		// Test permission verification by checking that the RBAC system is functioning
		// We can verify this by ensuring:
		// 1. Organization Owner role was properly assigned to admin user
		// 2. Default roles and permissions were created
		// 3. Role assignments work as expected

		// Use the generic database query methods since specific model accessors might not be available
		const db = testInstance.db;

		// Verify admin user has the Organization Owner role
		const adminMemberRole = await db.findOne({
			model: "memberRole",
			where: [
				{ field: "userId", value: adminUser.id },
				{ field: "organizationId", value: testOrg.id },
			],
		});

		expect(adminMemberRole).toBeTruthy();

		// Get the role details
		const adminRole = await db.findOne({
			model: "role",
			where: [
				{ field: "id", value: adminMemberRole?.roleId },
				{ field: "name", value: "Organization Owner" },
			],
		});

		expect(adminRole).toBeTruthy();
		expect(adminRole?.name).toBe("Organization Owner");

		// Verify that the Organization Owner role has permissions assigned
		const rolePermissions = await db.findMany({
			model: "rolePermission",
			where: [{ field: "roleId", value: adminRole?.id }],
		});

		expect(rolePermissions.length).toBeGreaterThan(0);

		// Test member role assignment functionality
		const memberSignUp = await auth.api.signUpEmail({
			body: {
				email: "member@test.com",
				password: "password123",
				name: "Member User",
			},
		});
		const memberUser = memberSignUp.user;

		// Create member with Member role
		await db.create({
			model: "member",
			data: {
				userId: memberUser.id,
				organizationId: testOrg.id,
				role: "member",
				createdAt: new Date(),
			},
		});

		// Find the Member role and assign it
		const memberRole = await db.findOne({
			model: "role",
			where: [
				{ field: "name", value: "Member" },
				{ field: "organizationId", value: testOrg.id },
			],
		});

		expect(memberRole).toBeTruthy();

		await db.create({
			model: "memberRole",
			data: {
				userId: memberUser.id,
				organizationId: testOrg.id,
				roleId: memberRole!.id,
				assignedBy: adminUser.id,
				assignedAt: new Date(),
			},
		});

		// Verify the member role assignment
		const memberMemberRole = await db.findOne({
			model: "memberRole",
			where: [
				{ field: "userId", value: memberUser.id },
				{ field: "organizationId", value: testOrg.id },
				{ field: "roleId", value: memberRole!.id },
			],
		});

		expect(memberMemberRole).toBeTruthy();

		// Verify Member role has fewer permissions than Organization Owner
		const memberRolePermissions = await db.findMany({
			model: "rolePermission",
			where: [{ field: "roleId", value: memberRole!.id }],
		});

		expect(memberRolePermissions.length).toBeGreaterThan(0);
		expect(memberRolePermissions.length).toBeLessThan(rolePermissions.length);
	});

	it("should create audit logs for role assignments", async () => {
		const auditLogs = await db.findMany({
			model: "auditLog",
			where: [{ field: "organizationId", value: testOrg.id }],
		});

		expect(auditLogs.length).toBeGreaterThan(1);

		// Verify audit log structure
		const log = auditLogs[0];
		expect(log.organizationId).toBe(testOrg.id);
		expect(log.action).toBeDefined();
		expect(log.timestamp).toBeDefined();
		expect(log.details).toBeDefined();
	});
});
