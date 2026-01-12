/**
 * Test file for GitHub Issue #7291
 * [Feature] Allow users to dismiss expired invitations
 *
 * This test demonstrates:
 * - Problem: When an invitation expires, the recipient cannot remove it from their list
 * - Solution: The new dismissInvitation endpoint that only works for expired invitations
 */

import { beforeAll, describe, expect, it } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";

describe("Issue #7291: Expired Invitation Handling", async () => {
	// Setup with a very short invitation expiration time for testing
	const { auth, signInWithUser } = await getTestInstance({
		plugins: [
			organization({
				// Set invitation to expire in 1 second for testing
				invitationExpiresIn: 1,
				async sendInvitationEmail() {
					// Mock email sending
				},
			}),
		],
		logger: {
			level: "error",
		},
	});

	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});

	// Test users
	const ownerUser = {
		email: "owner@test.com",
		password: "password123",
		name: "Organization Owner",
	};

	const invitedUser = {
		email: "invited@test.com",
		password: "password123",
		name: "Invited User",
	};

	let organizationId: string;
	let invitationId: string;
	let ownerHeaders: Headers;
	let invitedUserHeaders: Headers;

	// Setup: Create org, owner, invited user, and invitation
	beforeAll(async () => {
		// Create owner and sign in
		await client.signUp.email(ownerUser);
		const ownerSession = await signInWithUser(
			ownerUser.email,
			ownerUser.password,
		);
		ownerHeaders = ownerSession.headers;

		// Create an organization
		const org = await client.organization.create({
			name: "Test Org",
			slug: "test-org-expired",
			fetchOptions: { headers: ownerHeaders },
		});
		organizationId = org.data?.id as string;

		// Create invited user and sign in
		await client.signUp.email(invitedUser);
		const invitedSession = await signInWithUser(
			invitedUser.email,
			invitedUser.password,
		);
		invitedUserHeaders = invitedSession.headers;

		// Create invitation for the invited user
		const invitation = await client.organization.inviteMember({
			organizationId,
			email: invitedUser.email,
			role: "member",
			fetchOptions: { headers: ownerHeaders },
		});
		invitationId = invitation.data?.id as string;

		console.log("📧 Invitation created:", {
			invitationId,
			email: invitedUser.email,
			expiresAt: invitation.data?.expiresAt,
		});
	});

	it("should list the pending invitation for the invited user", async () => {
		// Before expiration, user should see the invitation
		const invitations = await client.organization.listUserInvitations({
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("📋 User invitations before expiration:", invitations.data);

		expect(invitations.data).toBeDefined();
		expect(invitations.data?.length).toBeGreaterThanOrEqual(1);

		const ourInvitation = invitations.data?.find(
			(inv) => inv.id === invitationId,
		);
		expect(ourInvitation).toBeDefined();
		expect(ourInvitation?.status).toBe("pending");
	});

	it("should not allow dismissing a non-expired invitation", async () => {
		// Try to dismiss before expiration - should fail
		const result = await client.organization.dismissInvitation({
			invitationId,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Dismiss non-expired invitation result:", {
			error: result.error?.message,
			status: result.error?.status,
		});

		// Should fail - invitation not expired yet
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		expect(result.error?.message).toContain("expired");
	});

	it("should allow accepting invitation before expiration", async () => {
		// This is just to verify normal flow works
		// We'll create a separate invitation for this test
		const freshInvitedUser = {
			email: "fresh-invited@test.com",
			password: "password123",
			name: "Fresh Invited",
		};

		await client.signUp.email(freshInvitedUser);
		const freshSession = await signInWithUser(
			freshInvitedUser.email,
			freshInvitedUser.password,
		);

		const freshInvitation = await client.organization.inviteMember({
			organizationId,
			email: freshInvitedUser.email,
			role: "member",
			fetchOptions: { headers: ownerHeaders },
		});

		const accepted = await client.organization.acceptInvitation({
			invitationId: freshInvitation.data?.id!,
			fetchOptions: { headers: freshSession.headers },
		});

		expect(accepted.data?.invitation.status).toBe("accepted");
		console.log(
			"✅ Fresh invitation accepted successfully (normal flow works)",
		);
	});

	// THE MAIN FIX VERIFICATION TESTS

	it("should fail to accept expired invitation", async () => {
		// Wait for the original invitation to expire
		console.log("⏳ Waiting for invitation to expire (2 seconds)...");
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Try to accept the expired invitation
		const result = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Accept expired invitation result:", {
			error: result.error?.message,
			status: result.error?.status,
		});

		// This SHOULD fail - correct behavior
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		console.log("✅ Accept correctly fails for expired invitation");
	});

	it("should fail to reject expired invitation", async () => {
		// This confirms the original bug - rejectInvitation fails for expired invitations
		const result = await client.organization.rejectInvitation({
			invitationId,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Reject expired invitation result:", {
			error: result.error?.message,
			status: result.error?.status,
			data: result.data,
		});

		// This confirms the bug still exists (by design) - user should use dismissInvitation instead
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		console.log(
			"✅ Reject correctly fails for expired invitation (use dismiss instead)",
		);
	});

	it("✅ FIX: should allow dismissing expired invitation", async () => {
		// THE FIX - use dismissInvitation for expired invitations
		const result = await client.organization.dismissInvitation({
			invitationId,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Dismiss expired invitation result:", {
			data: result.data,
			error: result.error?.message,
		});

		// This should now succeed!
		expect(result.error).toBeFalsy(); // error is null when successful
		expect(result.data).toBeDefined();
		expect(result.data?.invitation?.status).toBe("dismissed");
		console.log("🎉 SUCCESS: Expired invitation dismissed!");
	});

	it("should not show dismissed invitation in user list", async () => {
		// After dismissing, the invitation should either not appear or have dismissed status
		const invitations = await client.organization.listUserInvitations({
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log(
			"📋 User invitations after dismiss:",
			invitations.data?.map((inv) => ({
				id: inv.id,
				status: inv.status,
			})),
		);

		// Find our dismissed invitation
		const dismissedInvitation = invitations.data?.find(
			(inv) => inv.id === invitationId,
		);

		// If it's in the list, it should be marked as dismissed
		if (dismissedInvitation) {
			expect(dismissedInvitation.status).toBe("dismissed");
		}
		console.log("✅ Invitation correctly marked as dismissed");
	});

	it("should not allow dismissing an already dismissed invitation", async () => {
		// Try to dismiss again
		const result = await client.organization.dismissInvitation({
			invitationId,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Dismiss already-dismissed invitation result:", {
			error: result.error?.message,
			status: result.error?.status,
		});

		// Should fail - invitation already processed
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		console.log("✅ Cannot dismiss already-dismissed invitation");
	});

	it("should not allow non-recipient to dismiss invitation", async () => {
		// Create a new expired invitation
		const anotherUser = {
			email: "another@test.com",
			password: "password123",
			name: "Another User",
		};

		await client.signUp.email(anotherUser);
		const _anotherSession = await signInWithUser(
			anotherUser.email,
			anotherUser.password,
		);

		// Create invitation for another user
		const invitation = await client.organization.inviteMember({
			organizationId,
			email: anotherUser.email,
			role: "member",
			fetchOptions: { headers: ownerHeaders },
		});

		// Wait for it to expire
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Try to dismiss with wrong user (invitedUser instead of anotherUser)
		const result = await client.organization.dismissInvitation({
			invitationId: invitation.data?.id!,
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Dismiss by non-recipient result:", {
			error: result.error?.message,
			status: result.error?.status,
		});

		// Should fail - wrong recipient
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(403);
		console.log("✅ Cannot dismiss another user's invitation");
	});

	it("should not allow dismissing non-existent invitation", async () => {
		const result = await client.organization.dismissInvitation({
			invitationId: "non-existent-id",
			fetchOptions: { headers: invitedUserHeaders },
		});

		console.log("Dismiss non-existent invitation result:", {
			error: result.error?.message,
			status: result.error?.status,
		});

		// Should fail - invitation not found
		expect(result.error).toBeDefined();
		expect(result.error?.status).toBe(400);
		console.log("✅ Cannot dismiss non-existent invitation");
	});
});
