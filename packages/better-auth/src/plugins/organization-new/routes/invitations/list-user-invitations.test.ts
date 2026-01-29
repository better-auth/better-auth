import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("list user invitations", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithUser } = await defineInstance([plugin]);

	it("should list invitations for a user", async () => {
		const rng = crypto.randomUUID();
		const orgAdminUser = {
			email: `org-admin-${rng}@test.com`,
			password: rng,
			name: `org-admin-${rng}`,
		};
		const invitedUser = {
			email: `invited-${rng}@test.com`,
			password: rng,
			name: `invited-${rng}`,
		};

		// Create users
		await auth.api.signUpEmail({ body: orgAdminUser });
		await auth.api.signUpEmail({ body: invitedUser });

		const { headers: adminHeaders } = await signInWithUser(
			orgAdminUser.email,
			orgAdminUser.password,
		);
		const { headers: invitedHeaders } = await signInWithUser(
			invitedUser.email,
			invitedUser.password,
		);

		// Create organization
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: adminHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create invitation for the user
		const invitation = await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org.id,
				email: invitedUser.email,
				role: "member",
			},
		});

		// List user invitations
		const userInvitations = await auth.api.listUserInvitations({
			headers: invitedHeaders,
		});

		expect(userInvitations).toHaveLength(1);
		expect(userInvitations[0]?.id).toBe(invitation.invitation.id);
		expect(userInvitations[0]?.organizationName).toBe(orgData.name);
	});

	it("should allow listing invitations for a user using server (with email query)", async () => {
		const rng = crypto.randomUUID();
		const adminUser = {
			email: `admin-server-${rng}@test.com`,
			password: rng,
			name: `admin-server-${rng}`,
		};
		const invitedUser = {
			email: `invited-server-${rng}@test.com`,
			password: rng,
			name: `invited-server-${rng}`,
		};

		// Create users
		await auth.api.signUpEmail({ body: adminUser });
		await auth.api.signUpEmail({ body: invitedUser });

		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);

		// Create organization
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: adminHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create invitation
		await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org.id,
				email: invitedUser.email,
				role: "member",
			},
		});

		// List invitations using server API with email query
		const invitations = await auth.api.listUserInvitations({
			query: {
				email: invitedUser.email,
			},
		});

		expect(invitations.length).toBeGreaterThanOrEqual(1);
	});

	it("should support case-insensitive email lookup using server", async () => {
		const rng = crypto.randomUUID();
		const adminUser = {
			email: `admin-case-${rng}@test.com`,
			password: rng,
			name: `admin-case-${rng}`,
		};
		const invitedUserEmail = `invited-case-${rng}@test.com`;
		const invitedUser = {
			email: invitedUserEmail,
			password: rng,
			name: `invited-case-${rng}`,
		};

		// Create users
		await auth.api.signUpEmail({ body: adminUser });
		await auth.api.signUpEmail({ body: invitedUser });

		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);

		// Create organization
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: adminHeaders,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		// Create invitation
		await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org.id,
				email: invitedUserEmail,
				role: "member",
			},
		});

		// List with lowercase email
		const invitationsLower = await auth.api.listUserInvitations({
			query: {
				email: invitedUserEmail.toLowerCase(),
			},
		});

		// List with uppercase email
		const invitationsUpper = await auth.api.listUserInvitations({
			query: {
				email: invitedUserEmail.toUpperCase(),
			},
		});

		expect(invitationsLower.length).toBe(invitationsUpper.length);
	});

	it("should only list pending invitations (not accepted)", async () => {
		const rng = crypto.randomUUID();
		const adminUser = {
			email: `admin-pending-${rng}@test.com`,
			password: rng,
			name: `admin-pending-${rng}`,
		};
		const invitedUser = {
			email: `invited-pending-${rng}@test.com`,
			password: rng,
			name: `invited-pending-${rng}`,
		};

		await auth.api.signUpEmail({ body: adminUser });
		await auth.api.signUpEmail({ body: invitedUser });

		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);
		const { headers: invitedHeaders } = await signInWithUser(
			invitedUser.email,
			invitedUser.password,
		);

		// Create two organizations
		const org1Data = getOrganizationData();
		const org1 = await auth.api.createOrganization({
			headers: adminHeaders,
			body: { name: org1Data.name, slug: org1Data.slug },
		});

		const org2Data = getOrganizationData();
		const org2 = await auth.api.createOrganization({
			headers: adminHeaders,
			body: { name: org2Data.name, slug: org2Data.slug },
		});

		// Create invitations
		const invitation1 = await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org1.id,
				email: invitedUser.email,
				role: "member",
			},
		});
		const invitation2 = await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org2.id,
				email: invitedUser.email,
				role: "member",
			},
		});

		expect(invitation1.invitation).toBeDefined();
		expect(invitation2.invitation).toBeDefined();

		// Accept one invitation
		await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation1.invitation.id,
			},
		});

		// List user invitations - should only show pending ones (not accepted)
		const userInvitations = await auth.api.listUserInvitations({
			headers: invitedHeaders,
		});

		expect(userInvitations.length).toBe(1);
		expect(userInvitations[0]?.id).toBe(invitation2.invitation.id);
		expect(userInvitations[0]?.status).toBe("pending");
	});

	it("should not list rejected invitations", async () => {
		const rng = crypto.randomUUID();
		const adminUser = {
			email: `admin-reject-${rng}@test.com`,
			password: rng,
			name: `admin-reject-${rng}`,
		};
		const invitedUser = {
			email: `invited-reject-${rng}@test.com`,
			password: rng,
			name: `invited-reject-${rng}`,
		};

		await auth.api.signUpEmail({ body: adminUser });
		await auth.api.signUpEmail({ body: invitedUser });

		const { headers: adminHeaders } = await signInWithUser(
			adminUser.email,
			adminUser.password,
		);
		const { headers: invitedHeaders } = await signInWithUser(
			invitedUser.email,
			invitedUser.password,
		);

		// Create organization
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers: adminHeaders,
			body: { name: orgData.name, slug: orgData.slug },
		});

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers: adminHeaders,
			body: {
				organizationId: org.id,
				email: invitedUser.email,
				role: "member",
			},
		});

		expect(invitation.invitation).toBeDefined();

		// Reject the invitation
		await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// List user invitations - should be empty since the only invitation was rejected
		const userInvitations = await auth.api.listUserInvitations({
			headers: invitedHeaders,
		});

		expect(userInvitations.length).toBe(0);
	});

	it("should return empty list for user with no invitations", async () => {
		const rng = crypto.randomUUID();
		const newUser = {
			email: `no-invites-${rng}@test.com`,
			password: rng,
			name: `no-invites-${rng}`,
		};

		await auth.api.signUpEmail({ body: newUser });

		const { headers: userHeaders } = await signInWithUser(
			newUser.email,
			newUser.password,
		);

		const userInvitations = await auth.api.listUserInvitations({
			headers: userHeaders,
		});

		expect(userInvitations).toHaveLength(0);
	});

	it("should require authentication or email query", async () => {
		// Calling without headers and without email should fail
		await expect(
			auth.api.listUserInvitations({
				headers: new Headers(),
			}),
		).rejects.toThrow();
	});

	describe("disable slugs", async (it) => {
		const plugin = organization({
			disableSlugs: true,
			async sendInvitationEmail(data, request) {},
		});
		const { auth, signInWithUser } = await defineInstance([plugin]);

		it("should list user invitations without organizationSlug when slugs are disabled", async () => {
			const rng = crypto.randomUUID();
			const adminUser = {
				email: `admin-no-slug-${rng}@test.com`,
				password: rng,
				name: `admin-no-slug-${rng}`,
			};
			const invitedUser = {
				email: `invited-no-slug-${rng}@test.com`,
				password: rng,
				name: `invited-no-slug-${rng}`,
			};

			await auth.api.signUpEmail({ body: adminUser });
			await auth.api.signUpEmail({ body: invitedUser });

			const { headers: adminHeaders } = await signInWithUser(
				adminUser.email,
				adminUser.password,
			);
			const { headers: invitedHeaders } = await signInWithUser(
				invitedUser.email,
				invitedUser.password,
			);

			// Create organization without slug
			const org = await auth.api.createOrganization({
				headers: adminHeaders,
				body: {
					name: `no-slug-org-${rng}`,
				},
			});

			// Verify organization doesn't have slug
			expect(org).toBeDefined();
			expect(org.id).toBeDefined();
			expect((org as any).slug).toBeUndefined();

			// Create invitation
			await auth.api.createInvitation({
				headers: adminHeaders,
				body: {
					organizationId: org.id,
					email: invitedUser.email,
					role: "member",
				},
			});

			// List user invitations
			const userInvitations = await auth.api.listUserInvitations({
				headers: invitedHeaders,
			});

			expect(userInvitations.length).toBeGreaterThanOrEqual(1);
			// Find the invitation for our test org
			const ourInvitation = userInvitations.find(
				(inv) => inv.organizationId === org.id,
			);
			expect(ourInvitation).toBeDefined();
			expect((ourInvitation as any).organizationSlug).toBeUndefined();
		});
	});
});
