import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("get active member", async (it) => {
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

	it("should return the active member", async () => {
		// First set the organization as active
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		const activeMember = await auth.api.getActiveMember({
			headers,
		});

		expect(activeMember).toBeDefined();
		expect(activeMember?.userId).toBeDefined();
		expect(activeMember?.organizationId).toBe(testOrg.id);
		expect(activeMember?.role).toBe("owner");
	});

	it("should return member with correct role after role update", async () => {
		// Create a new user and add them to the organization
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `get-active-member-test-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test member",
			},
		});

		await auth.api.addMember({
			body: {
				organizationId: testOrg.id,
				userId: newUser.user.id,
				role: "admin",
			},
		});

		// Sign in as the new user
		const signInResult = await auth.api.signInEmail({
			body: {
				email: newUser.user.email,
				password: "password",
			},
		});

		const newUserHeaders = new Headers();
		newUserHeaders.set("Authorization", `Bearer ${signInResult.token}`);

		// Set the organization as active for the new user
		await auth.api.setActiveOrganization({
			headers: newUserHeaders,
			body: {
				organizationId: testOrg.id,
			},
		});

		const activeMember = await auth.api.getActiveMember({
			headers: newUserHeaders,
		});

		expect(activeMember).toBeDefined();
		expect(activeMember?.role).toBe("admin");
	});

	it("should throw error when no active organization is set", async () => {
		// Create a new user without setting an active organization
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `no-active-org-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "no active org user",
			},
		});

		const newUserHeaders = new Headers();
		newUserHeaders.set("Authorization", `Bearer ${newUser.token}`);

		await expect(
			auth.api.getActiveMember({
				headers: newUserHeaders,
			}),
		).rejects.toThrow("No active organization");
	});

	it("should throw error when user is not a member of active organization", async () => {
		// Create a new user
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `not-member-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "not a member",
			},
		});

		const newUserHeaders = new Headers();
		newUserHeaders.set("Authorization", `Bearer ${newUser.token}`);

		// Create a separate organization for this user
		const separateOrgData = getOrganizationData();
		const separateOrg = await auth.api.createOrganization({
			headers: newUserHeaders,
			body: {
				name: separateOrgData.name,
				slug: separateOrgData.slug,
			},
		});

		// Set the separate org as active
		await auth.api.setActiveOrganization({
			headers: newUserHeaders,
			body: {
				organizationId: separateOrg.id,
			},
		});

		// Now the user should be able to get their active member (they are owner of their org)
		const activeMember = await auth.api.getActiveMember({
			headers: newUserHeaders,
		});

		expect(activeMember).toBeDefined();
		expect(activeMember?.organizationId).toBe(separateOrg.id);
	});
});
