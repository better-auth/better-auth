import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("get invitation", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers, user } = await signInWithTestUser();

	// Create an organization for testing
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should get invitation successfully as recipient", async () => {
		const invitedEmail = `get-success-${crypto.randomUUID()}@test.com`;

		// Sign up the invited user first
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Get the invitation as the recipient
		const receivedInvitation = await auth.api.getInvitation({
			query: {
				id: invitation.invitation.id,
			},
			headers: invitedHeaders,
		});

		expect(receivedInvitation).not.toBeNull();
		expect(receivedInvitation?.id).toBe(invitation.invitation.id);
		expect(receivedInvitation?.email.toLowerCase()).toBe(
			invitedEmail.toLowerCase(),
		);
		expect(receivedInvitation?.role).toBe("member");
		expect(receivedInvitation?.organizationId).toBe(testOrg.id);
		expect(receivedInvitation?.organizationName).toBe(testOrg.name);
		expect(receivedInvitation?.organizationSlug).toBe(testOrg.slug);
		expect(receivedInvitation?.inviterEmail).toBe(user.email);
		expect(receivedInvitation?.status).toBe("pending");
	});

	it("should not get invitation with invalid invitation ID", async () => {
		const invitedEmail = `get-invalid-${crypto.randomUUID()}@test.com`;

		// Sign up a user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Test User",
			},
		});
		const { headers: userHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		await expect(
			auth.api.getInvitation({
				query: {
					id: "invalid-id-123",
				},
				headers: userHeaders,
			}),
		).rejects.toThrow("Invitation not found!");
	});

	it("should not get invitation if user is not the recipient", async () => {
		const invitedEmail = `get-recipient-${crypto.randomUUID()}@test.com`;
		const otherUserEmail = `get-other-${crypto.randomUUID()}@test.com`;

		// Sign up the intended recipient
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});

		// Sign up another user
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

		// Create invitation for the first user
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Try to get the invitation as a different user
		await expect(
			auth.api.getInvitation({
				query: {
					id: invitation.invitation.id,
				},
				headers: otherHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION
				.message,
		);
	});

	it("should not get canceled invitation", async () => {
		const invitedEmail = `get-canceled-${crypto.randomUUID()}@test.com`;

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Cancel the invitation
		await auth.api.cancelInvitation({
			headers,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Try to get the canceled invitation
		await expect(
			auth.api.getInvitation({
				query: {
					id: invitation.invitation.id,
				},
				headers: invitedHeaders,
			}),
		).rejects.toThrow("Invitation not found!");
	});

	it("should not get expired invitation", async () => {
		const invitedEmail = `get-expired-${crypto.randomUUID()}@test.com`;

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Manually update the invitation to be expired
		await adapter.update({
			model: "invitation",
			where: [{ field: "id", value: invitation.invitation.id }],
			update: {
				expiresAt: new Date(Date.now() - 1000), // 1 second ago
			},
		});

		// Try to get the expired invitation
		await expect(
			auth.api.getInvitation({
				query: {
					id: invitation.invitation.id,
				},
				headers: invitedHeaders,
			}),
		).rejects.toThrow("Invitation not found!");
	});

	it("should not get invitation if inviter is no longer a member", async () => {
		// Create a new org for this test
		const newOrgData = getOrganizationData();
		const newOrg = await auth.api.createOrganization({
			headers,
			body: {
				name: newOrgData.name,
				slug: newOrgData.slug,
			},
		});

		// Create invitation for a new user
		const invitedEmail = `get-inviter-left-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: newOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Remove the original owner (inviter) from the org using adapter directly
		await adapter.delete({
			model: "member",
			where: [
				{ field: "organizationId", value: newOrg.id },
				{ field: "userId", value: user.id },
			],
		});

		// Try to get the invitation - should fail because inviter is no longer a member
		await expect(
			auth.api.getInvitation({
				query: {
					id: invitation.invitation.id,
				},
				headers: invitedHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION
				.message,
		);
	});

	it("should not get invitation without authentication", async () => {
		const invitedEmail = `get-no-auth-${crypto.randomUUID()}@test.com`;

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Try to get the invitation without headers
		await expect(
			auth.api.getInvitation({
				query: {
					id: invitation.invitation.id,
				},
				headers: new Headers(),
			}),
		).rejects.toThrow();
	});

	it("should get invitation with case-insensitive email matching", async () => {
		const baseEmail = `get-case-${crypto.randomUUID()}`;
		const invitedEmail = `${baseEmail}@TEST.COM`;
		const signUpEmail = `${baseEmail}@test.com`;

		// Sign up with lowercase email
		await auth.api.signUpEmail({
			body: {
				email: signUpEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			signUpEmail,
			"test123456",
		);

		// Create invitation with uppercase email
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Get the invitation - should work due to case-insensitive matching
		const receivedInvitation = await auth.api.getInvitation({
			query: {
				id: invitation.invitation.id,
			},
			headers: invitedHeaders,
		});

		expect(receivedInvitation).not.toBeNull();
		expect(receivedInvitation?.id).toBe(invitation.invitation.id);
	});

	it("should return organization details in invitation response", async () => {
		const invitedEmail = `get-details-${crypto.randomUUID()}@test.com`;

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Invited User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "admin",
			},
		});

		// Get the invitation
		const receivedInvitation = await auth.api.getInvitation({
			query: {
				id: invitation.invitation.id,
			},
			headers: invitedHeaders,
		});

		// Verify all expected fields are present
		expect(receivedInvitation).toMatchObject({
			id: invitation.invitation.id,
			email: expect.any(String),
			role: "admin",
			organizationId: testOrg.id,
			inviterId: user.id,
			status: "pending",
			organizationName: testOrg.name,
			organizationSlug: testOrg.slug,
			inviterEmail: user.email,
		});
		expect(receivedInvitation?.expiresAt).toBeDefined();
		expect(receivedInvitation?.createdAt).toBeDefined();
	});
});
