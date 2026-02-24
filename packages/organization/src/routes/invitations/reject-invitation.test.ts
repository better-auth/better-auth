import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("reject invitation", async (it) => {
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

	it("should not reject invitation with invalid invitation ID", async () => {
		// Create a user to reject the invitation
		const invitedEmail = `invited-invalid-${crypto.randomUUID()}@test.com`;
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

		await expect(
			auth.api.rejectInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: "invalid-id-123",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});

	it("should not allow rejecting invitation for another user", async () => {
		// Create invitation for one user
		const targetEmail = `target-${crypto.randomUUID()}@test.com`;
		const wrongEmail = `wrong-${crypto.randomUUID()}@test.com`;

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: targetEmail,
				role: "member",
			},
		});

		// Sign up both users
		await auth.api.signUpEmail({
			body: {
				email: targetEmail,
				password: "test123456",
				name: "Target User",
			},
		});
		await auth.api.signUpEmail({
			body: {
				email: wrongEmail,
				password: "test123456",
				name: "Wrong User",
			},
		});

		// Try to reject with wrong user
		const { headers: wrongHeaders } = await signInWithUser(
			wrongEmail,
			"test123456",
		);

		await expect(
			auth.api.rejectInvitation({
				headers: wrongHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION
				.message,
		);
	});

	it("should reject invitation successfully", async () => {
		const invitedEmail = `reject-success-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

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

		// Reject the invitation
		const result = await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.invitation?.status).toBe("rejected");
		expect(result?.member).toBeNull();
	});

	it("should reject invitation with email case insensitively", async () => {
		// Create invitation with lowercase email
		const rng = crypto.randomUUID();
		const lowerEmail = `case-reject-${rng}@test.com`;

		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: lowerEmail,
				role: "member",
			},
		});

		// Sign up with uppercase email
		await auth.api.signUpEmail({
			body: {
				email: lowerEmail.toUpperCase(),
				password: "test123456",
				name: "Case Test User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			lowerEmail.toUpperCase(),
			"test123456",
		);

		// Should be able to reject
		const result = await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.invitation?.status).toBe("rejected");
	});

	it("should not reject already rejected invitation", async () => {
		const invitedEmail = `double-reject-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up and reject first time
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

		await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Try to reject again
		await expect(
			auth.api.rejectInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});

	it("should not reject already accepted invitation", async () => {
		const invitedEmail = `accepted-reject-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up and accept the invitation
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

		await auth.api.acceptInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		// Try to reject after accepting
		await expect(
			auth.api.rejectInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});
});

describe("reject invitation - expired invitation", async (it) => {
	const plugin = organization({
		invitationExpiresIn: 1, // 1 second
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	it("should allow rejecting expired invitations", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const invitedEmail = `expired-reject-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up the user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Expired User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Wait for invitation to expire
		await new Promise((resolve) => setTimeout(resolve, 1100));

		// Rejecting expired invitation should succeed
		const result = await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.invitation?.status).toBe("rejected");
	});
});

describe("reject invitation - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeRejectInvitation: async (data) => {
				hooksCalled.push("beforeRejectInvitation");
			},
			afterRejectInvitation: async (data) => {
				hooksCalled.push("afterRejectInvitation");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser, signInWithUser } = await defineInstance([
		plugin,
	]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should call reject invitation hooks", async () => {
		hooksCalled = [];

		const invitedEmail = `hooks-${crypto.randomUUID()}@test.com`;
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Hooks User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(hooksCalled).toContain("beforeRejectInvitation");
		expect(hooksCalled).toContain("afterRejectInvitation");
	});
});

describe("reject invitation - email verification required", async (it) => {
	const plugin = organization({
		requireEmailVerificationOnInvitation: true,
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should not allow rejecting invitation without verified email", async () => {
		const invitedEmail = `unverified-reject-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up the user (email is not verified by default)
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Unverified User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Try to reject without verified email
		await expect(
			auth.api.rejectInvitation({
				headers: invitedHeaders,
				body: {
					invitationId: invitation.invitation.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION
				.message,
		);
	});

	it("should allow rejecting invitation with verified email", async () => {
		const invitedEmail = `verified-reject-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitation = await auth.api.createInvitation({
			headers,
			body: {
				organizationId: org.id,
				email: invitedEmail,
				role: "member",
			},
		});

		// Sign up and verify the user's email
		const signupRes = await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Verified User",
			},
		});

		// Manually verify the email
		await adapter.update({
			model: "user",
			where: [{ field: "id", value: signupRes.user.id }],
			update: { emailVerified: true },
		});

		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Should be able to reject with verified email
		const result = await auth.api.rejectInvitation({
			headers: invitedHeaders,
			body: {
				invitationId: invitation.invitation.id,
			},
		});

		expect(result).not.toBeNull();
		expect(result?.invitation?.status).toBe("rejected");
	});
});
