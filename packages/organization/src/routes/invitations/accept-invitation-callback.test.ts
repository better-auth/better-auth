import { describe, expect } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import type { Invitation } from "../../schema";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("accept invitation callback", async (it) => {
	const plugin = organization({
		async sendInvitationEmail(data, request) {},
	});
	const { auth, client, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should accept invitation via callback and redirect", async () => {
		const invitedEmail = `callback-accept-${crypto.randomUUID()}@test.com`;

		// Create invitation using the URL endpoint
		const invitationResult = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Callback User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		let redirectLocation: string | null = null;

		// Call the callback endpoint - use fetch to capture redirect
		await client.$fetch(
			`/organization/accept-invitation-callback?invitationId=${invitationResult.invitation.id}&callbackURL=${encodeURIComponent("https://myapp.com/dashboard")}`,
			{
				headers: invitedHeaders,
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					redirectLocation = context.response.headers.get("location");
				},
			},
		);

		expect(redirectLocation).toBe("https://myapp.com/dashboard");

		// Verify the invitation was accepted
		const invitations = await adapter.findMany<Invitation>({
			model: "invitation",
			where: [{ field: "id", value: invitationResult.invitation.id }],
		});
		expect(invitations[0]?.status).toBe("accepted");

		// Verify the user is now a member
		const members = await adapter.findMany({
			model: "member",
			where: [
				{ field: "organizationId", value: testOrg.id },
				{ field: "role", value: "member" },
			],
		});
		const newMember = members.find(
			(m: any) => m.organizationId === testOrg.id && m.role === "member",
		);
		expect(newMember).toBeDefined();
	});

	it("should return JSON when no callbackURL provided", async () => {
		const invitedEmail = `callback-no-redirect-${crypto.randomUUID()}@test.com`;

		// Create invitation
		const invitationResult = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
				// No callbackURL
			},
		});

		// Sign up the invited user
		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "No Redirect User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Call the callback endpoint without callbackURL
		const result = await auth.api.acceptInvitationCallback({
			headers: invitedHeaders,
			query: {
				invitationId: invitationResult.invitation.id,
			},
		});

		expect(result?.invitation.status).toBe("accepted");
		expect(result?.member).toBeDefined();
		expect(result?.organization).toBeDefined();
	});

	it("should redirect with error for invalid invitation", async () => {
		const userEmail = `callback-invalid-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: userEmail,
				password: "test123456",
				name: "Invalid Invitation User",
			},
		});
		const { headers: userHeaders } = await signInWithUser(
			userEmail,
			"test123456",
		);

		let redirectLocation: string | null = null;

		await client.$fetch(
			`/organization/accept-invitation-callback?invitationId=invalid-id-123&callbackURL=${encodeURIComponent("https://myapp.com/dashboard")}`,
			{
				headers: userHeaders,
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					redirectLocation = context.response.headers.get("location");
				},
			},
		);

		expect(redirectLocation).toContain("error=");
		expect(redirectLocation).toContain("INVITATION_NOT_FOUND");
	});

	it("should redirect with error when user email does not match invitation", async () => {
		const invitedEmail = `callback-target-${crypto.randomUUID()}@test.com`;
		const wrongEmail = `callback-wrong-${crypto.randomUUID()}@test.com`;

		// Create invitation for one email
		const invitationResult = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
				callbackURL: "https://myapp.com/dashboard",
			},
		});

		// Sign up wrong user
		await auth.api.signUpEmail({
			body: {
				email: wrongEmail,
				password: "test123456",
				name: "Wrong User",
			},
		});
		const { headers: wrongHeaders } = await signInWithUser(
			wrongEmail,
			"test123456",
		);

		let redirectLocation: string | null = null;

		await client.$fetch(
			`/organization/accept-invitation-callback?invitationId=${invitationResult.invitation.id}&callbackURL=${encodeURIComponent("https://myapp.com/dashboard")}`,
			{
				headers: wrongHeaders,
				method: "GET",
				onError(context) {
					expect(context.response.status).toBe(302);
					redirectLocation = context.response.headers.get("location");
				},
			},
		);

		expect(redirectLocation).toContain("error=");
		expect(redirectLocation).toContain(
			"YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
		);
	});

	it("should throw error without redirect when no callbackURL and invalid invitation", async () => {
		const userEmail = `callback-no-url-error-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: userEmail,
				password: "test123456",
				name: "No URL Error User",
			},
		});
		const { headers: userHeaders } = await signInWithUser(
			userEmail,
			"test123456",
		);

		await expect(
			auth.api.acceptInvitationCallback({
				headers: userHeaders,
				query: {
					invitationId: "invalid-id-123",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.INVITATION_NOT_FOUND.message);
	});
});
