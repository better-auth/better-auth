import { describe, it, expect, beforeAll } from "vitest";
import { getTestInstance } from "../../../../test-utils/test-instance";
import { organization } from "../../organization";
import { organizationRbac } from "../rbac-organization";
import type { BetterAuthOptions } from "../../../../types";

describe("RBAC Organization Comprehensive Tests", () => {
	let auth: any;
	let db: any;
	let adminUser: any;
	let regularUser: any;
	let testOrg: any;

	beforeAll(async () => {
		const testInstance = await getTestInstance({
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
	});

	it("should create organization and verify RBAC setup", async () => {
		console.log("DEBUG: Creating organization with admin user:", adminUser.id);

		// Create organization
		const orgResponse = await auth.api.createOrganization({
			body: {
				name: "RBAC Test Organization",
				slug: "rbac-test-org",
			},
			headers: {
				authorization: `Bearer ${auth.api.getSession({
					userId: adminUser.id,
				})}`,
			},
		});

		expect(orgResponse.organization).toBeDefined();
		expect(orgResponse.organization.name).toBe("RBAC Test Organization");
		testOrg = orgResponse.organization;

		console.log("DEBUG: Organization created:", testOrg.id);

		// Verify RBAC tables have data
		const permissions = await db.findMany({
			model: "permission",
			where: {
				organizationId: testOrg.id,
			},
		});

		const roles = await db.findMany({
			model: "role",
			where: {
				organizationId: testOrg.id,
			},
		});

		const userRoles = await db.findMany({
			model: "userRole",
			where: {
				organizationId: testOrg.id,
			},
		});

		const auditLogs = await db.findMany({
			model: "rbacAuditLog",
			where: {
				organizationId: testOrg.id,
			},
		});

		console.log("DEBUG: Permissions count:", permissions.length);
		console.log("DEBUG: Roles count:", roles.length);
		console.log("DEBUG: User roles count:", userRoles.length);
		console.log("DEBUG: Audit logs count:", auditLogs.length);

		// Verify expected counts
		expect(permissions.length).toBeGreaterThan(0);
		expect(roles.length).toBe(3); // admin, editor, viewer
		expect(userRoles.length).toBe(1); // owner should have admin role
		expect(auditLogs.length).toBeGreaterThan(0);

		// Verify owner has admin role
		const ownerRole = userRoles.find((ur: any) => ur.userId === adminUser.id);
		expect(ownerRole).toBeDefined();

		const adminRole = roles.find((r: any) => r.name === "admin");
		expect(adminRole).toBeDefined();
		expect(ownerRole?.roleId).toBe(adminRole?.id);
	});

	it("should add member and assign role", async () => {
		// Add regular user as editor
		const inviteResponse = await auth.api.inviteUser({
			body: {
				email: regularUser.email,
				organizationId: testOrg.id,
				role: "member",
			},
			headers: {
				authorization: `Bearer ${auth.api.getSession({
					userId: adminUser.id,
				})}`,
			},
		});

		expect(inviteResponse.status).toBe(200);

		// Accept invitation
		const acceptResponse = await auth.api.acceptInvitation({
			body: {
				invitationId: inviteResponse.invitation.id,
			},
			headers: {
				authorization: `Bearer ${auth.api.getSession({
					userId: regularUser.id,
				})}`,
			},
		});

		expect(acceptResponse.status).toBe(200);

		// Assign editor role to regular user
		const editorRole = await db.findFirst({
			model: "role",
			where: {
				organizationId: testOrg.id,
				name: "editor",
			},
		});

		expect(editorRole).toBeDefined();

		// Use RBAC adapter to assign role
		const rbacAdapter = auth.internal.rbacAdapter;
		await rbacAdapter.assignRole({
			userId: regularUser.id,
			organizationId: testOrg.id,
			roleId: editorRole.id,
		});

		// Verify assignment
		const userRole = await db.findFirst({
			model: "rbacUserRole",
			where: {
				userId: regularUser.id,
				organizationId: testOrg.id,
				roleId: editorRole.id,
			},
		});

		expect(userRole).toBeDefined();
		expect(userRole.assignedAt).toBeDefined();
	});

	it("should check user permissions", async () => {
		const rbacAdapter = auth.internal.rbacAdapter;

		// Check admin permissions
		const adminCanCreate = await rbacAdapter.checkPermission({
			userId: adminUser.id,
			organizationId: testOrg.id,
			permission: "user:create",
		});

		const adminCanDelete = await rbacAdapter.checkPermission({
			userId: adminUser.id,
			organizationId: testOrg.id,
			permission: "document:delete",
		});

		expect(adminCanCreate).toBe(true);
		expect(adminCanDelete).toBe(true);

		// Check regular user permissions (editor)
		const userCanRead = await rbacAdapter.checkPermission({
			userId: regularUser.id,
			organizationId: testOrg.id,
			permission: "document:read",
		});

		const userCanUpdate = await rbacAdapter.checkPermission({
			userId: regularUser.id,
			organizationId: testOrg.id,
			permission: "document:update",
		});

		const userCanDeleteUser = await rbacAdapter.checkPermission({
			userId: regularUser.id,
			organizationId: testOrg.id,
			permission: "user:delete",
		});

		expect(userCanRead).toBe(true);
		expect(userCanUpdate).toBe(true);
		expect(userCanDeleteUser).toBe(false);
	});

	it("should create audit logs for role assignments", async () => {
		const auditLogs = await db.findMany({
			model: "rbacAuditLog",
			where: {
				organizationId: testOrg.id,
			},
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
