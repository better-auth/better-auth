import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("remove member", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	// Create an organization for testing
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should remove member from organization by email", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `remove-by-email-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "remove by email user",
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
		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Verify member was added
		const orgBefore = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: org?.id },
		});
		expect(orgBefore?.members.length).toBe(2);

		// Remove member by email
		const removedMember = await auth.api.removeMember({
			headers,
			body: {
				organizationId: org?.id,
				memberIdOrEmail: newUser.user.email,
			},
		});

		expect(removedMember?.member).toBeDefined();
		expect(removedMember?.member.userId).toBe(newUser.user.id);

		// Verify member was removed
		const orgAfter = await auth.api.getFullOrganization({
			headers,
			query: { organizationId: org?.id },
		});
		expect(orgAfter?.members.length).toBe(1);
	});

	it("should remove member from organization by member ID", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `remove-by-id-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "remove by id user",
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
		const addedMember = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "admin",
			},
		});

		// Remove member by ID
		const removedMember = await auth.api.removeMember({
			headers,
			body: {
				organizationId: org?.id,
				memberIdOrEmail: addedMember!.id,
			},
		});

		expect(removedMember?.member).toBeDefined();
		expect(removedMember?.member.id).toBe(addedMember!.id);
	});

	it("should not allow removing member when not found", async () => {
		await expect(
			auth.api.removeMember({
				headers,
				body: {
					organizationId: testOrg.id,
					memberIdOrEmail: "non-existent-member-id",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});

	it("should not allow removing member with non-existent email", async () => {
		await expect(
			auth.api.removeMember({
				headers,
				body: {
					organizationId: testOrg.id,
					memberIdOrEmail: "non-existent@email.com",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});
});

describe("remove member - last owner protection", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should not allow removing the last owner from organization", async () => {
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

		// Try to remove the owner (should fail)
		await expect(
			auth.api.removeMember({
				headers,
				body: {
					organizationId: org?.id,
					memberIdOrEmail: ownerMember!.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER
				.message,
		);
	});

	it("should allow removing an owner if there are multiple owners", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create another user and add as owner
		const secondOwner = await auth.api.signUpEmail({
			body: {
				email: `second-owner-${crypto.randomUUID()}@email.com`,
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

		// Now we can remove the second owner
		const removedOwner = await auth.api.removeMember({
			headers,
			body: {
				organizationId: org?.id,
				memberIdOrEmail: secondOwner.user.email,
			},
		});

		expect(removedOwner?.member).toBeDefined();
		expect(removedOwner?.member.role).toBe("owner");
	});
});

describe("remove member - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeRemoveMember: async (data) => {
				hooksCalled.push("beforeRemoveMember");
			},
			afterRemoveMember: async (data) => {
				hooksCalled.push("afterRemoveMember");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should call remove member hooks", async () => {
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
				email: `hooks-remove-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hooks Remove User",
			},
		});

		await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		await auth.api.removeMember({
			headers,
			body: {
				organizationId: org.id,
				memberIdOrEmail: newUser.user.email,
			},
		});

		expect(hooksCalled).toContain("beforeRemoveMember");
		expect(hooksCalled).toContain("afterRemoveMember");
	});
});

describe("remove member - clear active organization", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	it("should clear active organization when member removes themselves", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create a new user and add them as admin
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `self-remove-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "self remove user",
			},
		});

		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "admin",
			},
		});

		// Sign in as the new user
		const memberSignIn = await client.signIn.email({
			email: newUser.user.email,
			password: "password",
		});
		const memberHeaders = new Headers();
		memberHeaders.set("Authorization", `Bearer ${memberSignIn.data?.token}`);

		// Set active organization for the member
		await auth.api.setActiveOrganization({
			headers: memberHeaders,
			body: { organizationId: org?.id },
		});

		// Verify active organization is set
		const sessionBefore = await auth.api.getSession({ headers: memberHeaders });
		expect(sessionBefore?.session.activeOrganizationId).toBe(org?.id);

		// Member removes themselves (leave organization)
		await auth.api.removeMember({
			headers: memberHeaders,
			body: {
				organizationId: org?.id,
				memberIdOrEmail: newUser.user.email,
			},
		});

		// Active organization should be cleared
		const sessionAfter = await auth.api.getSession({ headers: memberHeaders });
		expect(sessionAfter?.session.activeOrganizationId).toBeNull();
	});
});
