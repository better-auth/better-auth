import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../client";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import type { Invitation } from "../../schema";
import { getOrganizationData } from "../../test/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			trustedOrigins: ["https://myapp.com"],
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

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

	it("should reject protocol-relative URLs to prevent open redirect", async () => {
		const invitedEmail = `callback-open-redirect-${crypto.randomUUID()}@test.com`;

		const invitationResult = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Open Redirect User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Protocol-relative URL should be stripped (treated as no callbackURL)
		const result = await auth.api.acceptInvitationCallback({
			headers: invitedHeaders,
			query: {
				invitationId: invitationResult.invitation.id,
				callbackURL: "//evil.com",
			},
		});

		// Should return JSON instead of redirecting to evil.com
		expect(result?.invitation).toBeDefined();
		expect(result?.member).toBeDefined();
	});

	it("should reject untrusted absolute callbackURLs", async () => {
		const invitedEmail = `callback-untrusted-${crypto.randomUUID()}@test.com`;

		const invitationResult = await auth.api.createInvitationURL({
			headers,
			body: {
				organizationId: testOrg.id,
				email: invitedEmail,
				role: "member",
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: invitedEmail,
				password: "test123456",
				name: "Untrusted URL User",
			},
		});
		const { headers: invitedHeaders } = await signInWithUser(
			invitedEmail,
			"test123456",
		);

		// Untrusted absolute URL should be stripped
		const result = await auth.api.acceptInvitationCallback({
			headers: invitedHeaders,
			query: {
				invitationId: invitationResult.invitation.id,
				callbackURL: "https://evil.com/steal",
			},
		});

		expect(result?.invitation).toBeDefined();
		expect(result?.member).toBeDefined();
	});

	it("should apply privacy filter on JSON response", async () => {
		const privacyPlugin = organization({
			async sendInvitationEmail() {},
			privacy: {
				enabled: true,
				hiddenMemberFields: ["email"],
			},
		});
		const privacyInstance = await defineInstance([privacyPlugin]);

		const { headers: privacyOwnerHeaders } =
			await privacyInstance.signInWithTestUser();
		const privacyOrgData = getOrganizationData();
		const privacyOrg = await privacyInstance.auth.api.createOrganization({
			headers: privacyOwnerHeaders,
			body: {
				name: privacyOrgData.name,
				slug: privacyOrgData.slug,
			},
		});

		const privacyEmail = `callback-privacy-${crypto.randomUUID()}@test.com`;
		const invResult = await privacyInstance.auth.api.createInvitationURL({
			headers: privacyOwnerHeaders,
			body: {
				organizationId: privacyOrg.id,
				email: privacyEmail,
				role: "member",
			},
		});

		await privacyInstance.auth.api.signUpEmail({
			body: {
				email: privacyEmail,
				password: "test123456",
				name: "Privacy User",
			},
		});
		const { headers: privacyInvitedHeaders } =
			await privacyInstance.signInWithUser(privacyEmail, "test123456");

		const result = await privacyInstance.auth.api.acceptInvitationCallback({
			headers: privacyInvitedHeaders,
			query: {
				invitationId: invResult.invitation.id,
			},
		});

		// Email should be hidden by privacy filter
		expect(result?.invitation).toBeDefined();
		expect(
			(result?.invitation as Record<string, unknown>).email,
		).toBeUndefined();
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
