import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("leave organization", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	it("should allow a member to leave an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create a new user and add them as a member
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `leave-org-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "leaving member",
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

		// Leave the organization
		const leaveRes = await auth.api.leaveOrganization({
			headers: memberHeaders,
			body: {
				organizationId: org?.id,
			},
		});

		expect(leaveRes).toMatchObject({
			userId: newUser.user.id,
		});

		// Verify member was removed
		const orgAfter = await auth.api.getFullOrganization({
			headers: ownerHeaders,
			query: { organizationId: org?.id },
		});
		expect(orgAfter?.members.length).toBe(1);
	});

	it("should not allow leaving if member is not in the organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create a new user who is not a member
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `not-member-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "not a member",
			},
		});

		// Sign in as the new user
		const memberSignIn = await client.signIn.email({
			email: newUser.user.email,
			password: "password",
		});
		const memberHeaders = new Headers();
		memberHeaders.set("Authorization", `Bearer ${memberSignIn.data?.token}`);

		// Try to leave the organization (should fail)
		await expect(
			auth.api.leaveOrganization({
				headers: memberHeaders,
				body: {
					organizationId: org?.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});
});

describe("leave organization - last owner protection", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	it("should not allow the last owner to leave the organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Try to leave as the only owner
		await expect(
			auth.api.leaveOrganization({
				headers: ownerHeaders,
				body: {
					organizationId: org?.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER.message,
		);
	});

	it("should allow an owner to leave if there are multiple owners", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: ownerHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create a second owner
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

		// Sign in as the second owner
		const secondOwnerSignIn = await client.signIn.email({
			email: secondOwner.user.email,
			password: "password",
		});
		const secondOwnerHeaders = new Headers();
		secondOwnerHeaders.set(
			"Authorization",
			`Bearer ${secondOwnerSignIn.data?.token}`,
		);

		// Second owner leaves the organization
		const leaveRes = await auth.api.leaveOrganization({
			headers: secondOwnerHeaders,
			body: {
				organizationId: org?.id,
			},
		});

		expect(leaveRes).toMatchObject({
			userId: secondOwner.user.id,
			role: "owner",
		});

		// Verify second owner was removed
		const orgAfter = await auth.api.getFullOrganization({
			headers: ownerHeaders,
			query: { organizationId: org?.id },
		});
		expect(orgAfter?.members.length).toBe(1);
	});
});

describe("leave organization - clear active organization", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, client } = await defineInstance([plugin]);
	const { headers: ownerHeaders } = await signInWithTestUser();

	it("should clear active organization when member leaves", async () => {
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
				email: `clear-active-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "clear active user",
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

		// Leave the organization
		await auth.api.leaveOrganization({
			headers: memberHeaders,
			body: {
				organizationId: org?.id,
			},
		});

		// Active organization should be cleared
		const sessionAfter = await auth.api.getSession({ headers: memberHeaders });
		expect(sessionAfter?.session.activeOrganizationId).toBeNull();
	});
});
