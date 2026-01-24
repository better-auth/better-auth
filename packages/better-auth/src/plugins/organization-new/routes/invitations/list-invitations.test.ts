import { describe, expect } from "vitest";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("list invitations", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
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

	it("should list invitations for an organization", async () => {
		// Create a new org for this test to ensure clean state
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		const email1 = `list-test-1-${crypto.randomUUID()}@test.com`;
		const email2 = `list-test-2-${crypto.randomUUID()}@test.com`;

		// Create invitations
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email1,
				role: "member",
			},
		});
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email2,
				role: "admin",
			},
		});

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
			},
		});

		expect(result).toHaveProperty("invitations");
		expect(result).toHaveProperty("total");
		expect(result.total).toBe(2);
		expect(result.invitations).toHaveLength(2);
	});

	it("should list invitations with pagination limit", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create 5 invitations
		for (let i = 0; i < 5; i++) {
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: newOrg.id,
					email: `limit-test-${i}-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});
		}

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				limit: 2,
			},
		});

		expect(result.invitations).toHaveLength(2);
		expect(result.total).toBe(5);
	});

	it("should list invitations with pagination offset", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create 5 invitations
		for (let i = 0; i < 5; i++) {
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: newOrg.id,
					email: `offset-test-${i}-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});
		}

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				offset: 3,
			},
		});

		expect(result.invitations).toHaveLength(2);
		expect(result.total).toBe(5);
	});

	it("should list invitations with limit and offset combined", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create 10 invitations
		for (let i = 0; i < 10; i++) {
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: newOrg.id,
					email: `combined-test-${i}-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});
		}

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				limit: 3,
				offset: 2,
			},
		});

		expect(result.invitations).toHaveLength(3);
		expect(result.total).toBe(10);
	});

	it("should sort invitations by createdAt descending by default", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		const email1 = `sort-test-1-${crypto.randomUUID()}@test.com`;
		const email2 = `sort-test-2-${crypto.randomUUID()}@test.com`;

		// Create first invitation
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email1,
				role: "member",
			},
		});

		// Wait a bit to ensure different timestamps
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Create second invitation
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email2,
				role: "admin",
			},
		});

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
			},
		});

		// Should be sorted by createdAt desc (newest first)
		expect(result.invitations[0]?.email.toLowerCase()).toBe(
			email2.toLowerCase(),
		);
		expect(result.invitations[1]?.email.toLowerCase()).toBe(
			email1.toLowerCase(),
		);
	});

	it("should sort invitations ascending when specified", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		const email1 = `sort-asc-1-${crypto.randomUUID()}@test.com`;
		const email2 = `sort-asc-2-${crypto.randomUUID()}@test.com`;

		// Create first invitation
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email1,
				role: "member",
			},
		});

		// Wait a bit to ensure different timestamps
		await new Promise((resolve) => setTimeout(resolve, 50));

		// Create second invitation
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: email2,
				role: "admin",
			},
		});

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				sortBy: "createdAt",
				sortDirection: "asc",
			},
		});

		// Should be sorted by createdAt asc (oldest first)
		expect(result.invitations[0]?.email.toLowerCase()).toBe(
			email1.toLowerCase(),
		);
		expect(result.invitations[1]?.email.toLowerCase()).toBe(
			email2.toLowerCase(),
		);
	});

	it("should filter invitations by status", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		const pendingEmail = `filter-pending-${crypto.randomUUID()}@test.com`;
		const canceledEmail = `filter-canceled-${crypto.randomUUID()}@test.com`;

		// Create pending invitation
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: pendingEmail,
				role: "member",
			},
		});

		// Create and cancel another invitation
		const cancelInv = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: canceledEmail,
				role: "member",
			},
		});
		await auth.api.cancelInvitation({
			headers,
			body: {
				invitationId: cancelInv.invitation.id,
			},
		});

		// Filter by pending status
		const pendingResult = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				status: "pending",
			},
		});

		expect(pendingResult.total).toBe(1);
		expect(pendingResult.invitations[0]?.email.toLowerCase()).toBe(
			pendingEmail.toLowerCase(),
		);

		// Filter by canceled status
		const canceledResult = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
				status: "canceled",
			},
		});

		expect(canceledResult.total).toBe(1);
		expect(canceledResult.invitations[0]?.email.toLowerCase()).toBe(
			canceledEmail.toLowerCase(),
		);
	});

	it("should return empty list for organization with no invitations", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		const result = await auth.api.listInvitations({
			headers,
			query: {
				organizationId: newOrg.id,
			},
		});

		expect(result.invitations).toHaveLength(0);
		expect(result.total).toBe(0);
	});

	it("should use active organization when organizationId is not provided", async () => {
		// The user should have the testOrg as active org
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		// Create an invitation in testOrg
		const email = `active-org-test-${crypto.randomUUID()}@test.com`;
		await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: email,
				role: "member",
			},
		});

		// List without specifying organizationId
		const result = await auth.api.listInvitations({
			headers,
		});

		expect(result).toHaveProperty("invitations");
		expect(result).toHaveProperty("total");
		// Should have at least the one we just created
		expect(result.total).toBeGreaterThanOrEqual(1);
	});

	it("should not list invitations if user is not a member", async () => {
		// Create a new org
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create a new user who is not a member
		const otherUserEmail = `other-user-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: otherUserEmail,
				password: "test123456",
				name: "Other User",
			},
		});
		const { headers: otherHeaders } = await signInWithUser(
			otherUserEmail,
			"test123456",
		);

		// Try to list invitations
		await expect(
			auth.api.listInvitations({
				headers: otherHeaders,
				query: {
					organizationId: newOrg.id,
				},
			}),
		).rejects.toThrow("You are not a member of this organization");
	});

	it("should not list invitations without authentication", async () => {
		await expect(
			auth.api.listInvitations({
				headers: new Headers(),
				query: {
					organizationId: testOrg.id,
				},
			}),
		).rejects.toThrow();
	});

	it("should require organizationId when no active organization", async () => {
		// Create a new user with no active organization
		const newUserEmail = `no-org-user-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: newUserEmail,
				password: "test123456",
				name: "New User",
			},
		});
		const { headers: newHeaders } = await signInWithUser(
			newUserEmail,
			"test123456",
		);

		await expect(
			auth.api.listInvitations({
				headers: newHeaders,
			}),
		).rejects.toThrow("No active organization");
	});

	describe("disable slugs", async (it) => {
		const plugin = organization({
			disableSlugs: true,
			async sendInvitationEmail(data, request) {},
		});
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		it("should list invitations without organizationSlug when slugs are disabled", async () => {
			// Create an organization without slug
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
				},
			});

			// Verify organization doesn't have slug
			expect(org).toBeDefined();
			expect(org.id).toBeDefined();
			expect((org as any).slug).toBeUndefined();

			// Create invitations
			const email1 = `slug-test-1-${crypto.randomUUID()}@test.com`;
			const email2 = `slug-test-2-${crypto.randomUUID()}@test.com`;

			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: email1,
					role: "member",
				},
			});
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: email2,
					role: "admin",
				},
			});

			// List invitations
			const result = await auth.api.listInvitations({
				headers,
				query: {
					organizationId: org.id,
				},
			});

			expect(result.invitations).toHaveLength(2);
			expect(result.total).toBe(2);

			// Verify invitations don't have organizationSlug
			for (const invitation of result.invitations) {
				expect((invitation as any).organizationSlug).toBeUndefined();
				expect(invitation.organizationId).toBe(org.id);
			}
		});

		it("should work with pagination when slugs are disabled", async () => {
			// Create an organization without slug
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
				},
			});

			// Verify organization doesn't have slug
			expect((org as any).slug).toBeUndefined();

			// Create 5 invitations
			for (let i = 0; i < 5; i++) {
				await auth.api.createInvitation({
					headers,
					body: {
						organizationId: org.id,
						email: `slug-pagination-${i}-${crypto.randomUUID()}@test.com`,
						role: "member",
					},
				});
			}

			// List with pagination
			const result = await auth.api.listInvitations({
				headers,
				query: {
					organizationId: org.id,
					limit: 2,
					offset: 1,
				},
			});

			expect(result.invitations).toHaveLength(2);
			expect(result.total).toBe(5);

			// Verify invitations don't have organizationSlug
			for (const invitation of result.invitations) {
				expect((invitation as any).organizationSlug).toBeUndefined();
			}
		});

		it("should filter by status when slugs are disabled", async () => {
			// Create an organization without slug
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
				},
			});

			// Create invitations
			const pendingEmail = `slug-pending-${crypto.randomUUID()}@test.com`;
			const canceledEmail = `slug-canceled-${crypto.randomUUID()}@test.com`;

			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: pendingEmail,
					role: "member",
				},
			});

			const cancelInv = await auth.api.createInvitation({
				headers,
				body: {
					organizationId: org.id,
					email: canceledEmail,
					role: "member",
				},
			});
			await auth.api.cancelInvitation({
				headers,
				body: {
					invitationId: cancelInv.invitation.id,
				},
			});

			// Filter by pending status
			const pendingResult = await auth.api.listInvitations({
				headers,
				query: {
					organizationId: org.id,
					status: "pending",
				},
			});

			expect(pendingResult.total).toBe(1);
			expect(
				(pendingResult.invitations[0] as any).organizationSlug,
			).toBeUndefined();
		});
	});
});
