import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("update member role", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should update member role (single role)", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `update-role-single-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "update role single user",
			},
		});

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		// Add member first
		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Update member role
		const updatedMember = await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId: org?.id,
				memberId: member!.id,
				role: "admin",
			},
		});

		expect(updatedMember?.role).toBe("admin");
	});

	it("should update member role (multiple roles)", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `update-role-multi-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "update role multi user",
			},
		});

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		// Add member first
		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Update member role to multiple roles
		const updatedMember = await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId: org?.id,
				memberId: member!.id,
				role: ["admin", "member"],
			},
		});

		expect(updatedMember?.role).toBe("admin,member");
	});

	it("should not allow non-members to update roles", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();

		// Create org as owner
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers: ownerHeaders,
		});

		// Create another user who is NOT a member of this org
		const outsider = await auth.api.signUpEmail({
			body: {
				email: `outsider-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "outsider user",
			},
		});
		const outsiderHeaders = new Headers();
		outsiderHeaders.set("Authorization", `Bearer ${outsider.token}`);

		// Get the owner member
		const fullOrg = await auth.api.getFullOrganization({
			headers: ownerHeaders,
			query: { organizationId: org?.id },
		});
		const ownerMember = fullOrg?.members.find((m) => m.role === "owner");

		// Outsider tries to update owner's role (should fail)
		await expect(
			auth.api.updateMemberRole({
				headers: outsiderHeaders,
				body: {
					organizationId: org?.id,
					memberId: ownerMember!.id,
					role: "admin",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});

	it("should not allow non-owners to update owner roles", async () => {
		const { headers: ownerHeaders } = await signInWithTestUser();

		// Create org as owner
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers: ownerHeaders,
		});

		// Create an admin user
		const adminUser = await auth.api.signUpEmail({
			body: {
				email: `admin-updater-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "admin updater",
			},
		});

		// Add admin to org
		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: adminUser.user.id,
				role: "admin",
			},
		});

		const adminHeaders = new Headers();
		adminHeaders.set("Authorization", `Bearer ${adminUser.token}`);

		// Get the owner member
		const fullOrg = await auth.api.getFullOrganization({
			headers: ownerHeaders,
			query: { organizationId: org?.id },
		});
		const ownerMember = fullOrg?.members.find((m) => m.role === "owner");

		// Admin tries to update owner's role (should fail)
		await expect(
			auth.api.updateMemberRole({
				headers: adminHeaders,
				body: {
					organizationId: org?.id,
					memberId: ownerMember!.id,
					role: "admin",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER
				.message,
		);
	});
});

describe("update member role - last owner protection", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);

	it("should prevent removing last owner's role", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Get the owner member
		const fullOrg = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: org?.id },
		});
		const ownerMember = fullOrg?.members.find((m) => m.role === "owner");

		// Try to change owner's role to admin (should fail - last owner)
		await expect(
			auth.api.updateMemberRole({
				headers,
				body: {
					organizationId: org?.id,
					memberId: ownerMember!.id,
					role: "admin",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER.message,
		);
	});

	it("should allow removing owner role if there are multiple owners", async () => {
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create second owner
		const secondOwner = await auth.api.signUpEmail({
			body: {
				email: `second-owner-role-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "second owner",
			},
		});

		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: secondOwner.user.id,
				role: "owner",
			},
		});

		// Get the original owner member
		const fullOrg = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: org?.id },
		});
		const originalOwnerMember = fullOrg?.members.find(
			(m) => m.role === "owner" && m.userId !== secondOwner.user.id,
		);

		// Now we can change the original owner's role to admin
		const updatedMember = await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId: org?.id,
				memberId: originalOwnerMember!.id,
				role: "admin",
			},
		});

		expect(updatedMember?.role).toBe("admin");
	});
});

describe("update member role - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeUpdateMemberRole: async (data) => {
				hooksCalled.push("beforeUpdateMemberRole");
			},
			afterUpdateMemberRole: async (data) => {
				hooksCalled.push("afterUpdateMemberRole");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should call update member role hooks", async () => {
		hooksCalled = [];

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `hooks-update-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hooks Update User",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId: org.id,
				memberId: member!.id,
				role: "admin",
			},
		});

		expect(hooksCalled).toContain("beforeUpdateMemberRole");
		expect(hooksCalled).toContain("afterUpdateMemberRole");
	});

	it("should allow before hook to modify the role", async () => {
		const modifyPlugin = organization({
			hooks: {
				beforeUpdateMemberRole: async (data) => {
					// Modify the role in the hook
					return {
						data: {
							role: "member,admin", // Override the role
						},
					};
				},
			},
			async sendInvitationEmail() {},
		});
		const { auth, signInWithTestUser } = await defineInstance([modifyPlugin]);
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `hooks-modify-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hooks Modify User",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Try to update to "admin" but hook will change it to "member,admin"
		const updatedMember = await auth.api.updateMemberRole({
			headers,
			body: {
				organizationId: org.id,
				memberId: member!.id,
				role: "admin",
			},
		});

		expect(updatedMember?.role).toBe("member,admin");
	});
});
