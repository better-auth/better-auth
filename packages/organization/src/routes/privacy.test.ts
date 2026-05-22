import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { organizationClient } from "../client";
import { organization } from "../organization";
import { getOrganizationData } from "../test/utils";

async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
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

	return instance;
}

describe("organization privacy", () => {
	describe("privacy disabled (default)", () => {
		it("should include member emails in get-full-organization", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization(),
			]);
			const { headers, user } = await signInWithTestUser();

			const orgData = getOrganizationData();
			await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg).not.toBeNull();
			expect(fullOrg?.members).toBeDefined();
			expect(fullOrg?.members.length).toBeGreaterThan(0);
			expect(fullOrg?.members[0].user.email).toBe(user.email);
		});

		it("should include invitation email in list-invitations", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					async sendInvitationEmail() {},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const inviteeEmail = `invite-${crypto.randomUUID()}@test.com`;
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: inviteeEmail,
					role: "member",
				},
			});

			const invitations = await auth.api.listInvitations({
				headers,
				query: { organizationId: testOrg.id },
			});

			expect(invitations.invitations.length).toBeGreaterThan(0);
			expect(invitations.invitations[0].email).toBe(inviteeEmail);
		});
	});

	describe("privacy enabled with defaults", () => {
		it("should hide member emails in get-full-organization", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({ privacy: true }),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg).not.toBeNull();
			expect(fullOrg?.members).toBeDefined();
			expect(fullOrg?.members.length).toBeGreaterThan(0);
			expect(fullOrg?.members[0].user.email).toBeUndefined();
			expect(fullOrg?.members[0].user.id).toBeDefined();
			expect(fullOrg?.members[0].user.name).toBeDefined();
		});

		it("should hide invitation email in list-invitations", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: true,
					async sendInvitationEmail() {},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const inviteeEmail = `invite-${crypto.randomUUID()}@test.com`;
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: inviteeEmail,
					role: "member",
				},
			});

			const invitations = await auth.api.listInvitations({
				headers,
				query: { organizationId: testOrg.id },
			});

			expect(invitations.invitations.length).toBeGreaterThan(0);
			expect(invitations.invitations[0].email).toBeUndefined();
			expect(invitations.invitations[0].id).toBeDefined();
			expect(invitations.invitations[0].role).toBe("member");
		});

		it("should hide invitation email in create-invitation response", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: true,
					async sendInvitationEmail() {},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const result = await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: `invite-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});

			expect(result.invitation).toBeDefined();
			expect(result.invitation.email).toBeUndefined();
			expect(result.invitation.id).toBeDefined();
		});

		it("should hide invitations email in get-full-organization", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: true,
					async sendInvitationEmail() {},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: `invite-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg?.invitations).toBeDefined();
			expect(fullOrg?.invitations.length).toBeGreaterThan(0);
			expect(fullOrg?.invitations[0].email).toBeUndefined();
		});
	});

	describe("privacy with custom configuration", () => {
		it("should hide specified member fields only", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: {
						hiddenMemberFields: ["email", "image"],
					},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg?.members[0].user.email).toBeUndefined();
			expect(fullOrg?.members[0].user.image).toBeUndefined();
			expect(fullOrg?.members[0].user.name).toBeDefined();
			expect(fullOrg?.members[0].user.id).toBeDefined();
		});

		it("should allow hiding only member fields without invitation fields", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: {
						hiddenMemberFields: ["email"],
						hiddenInvitationFields: [],
					},
					async sendInvitationEmail() {},
				}),
			]);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const inviteeEmail = `invite-${crypto.randomUUID()}@test.com`;
			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: inviteeEmail,
					role: "member",
				},
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg?.members[0].user.email).toBeUndefined();
			expect(fullOrg?.invitations[0].email).toBe(inviteeEmail);
		});

		it("should allow hiding only invitation fields without member fields", async () => {
			const { auth, signInWithTestUser } = await defineInstance([
				organization({
					privacy: {
						hiddenMemberFields: [],
						hiddenInvitationFields: ["email"],
					},
					async sendInvitationEmail() {},
				}),
			]);
			const { headers, user } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: `invite-${crypto.randomUUID()}@test.com`,
					role: "member",
				},
			});

			const fullOrg = await auth.api.getFullOrganization({ headers });

			expect(fullOrg?.members[0].user.email).toBe(user.email);
			expect(fullOrg?.invitations[0].email).toBeUndefined();
		});
	});

	describe("get-invitation endpoint privacy", () => {
		it("should hide inviterEmail when privacy is enabled", async () => {
			const { auth, signInWithTestUser, signInWithUser } = await defineInstance(
				[
					organization({
						privacy: true,
						async sendInvitationEmail() {},
					}),
				],
			);
			const { headers } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const inviteeEmail = `invitee-${crypto.randomUUID()}@test.com`;
			const inviteePassword = "password123";

			await auth.api.signUpEmail({
				body: {
					email: inviteeEmail,
					password: inviteePassword,
					name: "Invitee User",
				},
			});
			const { headers: inviteeHeaders } = await signInWithUser(
				inviteeEmail,
				inviteePassword,
			);

			const inviteResult = await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: inviteeEmail,
					role: "member",
				},
			});

			const invitation = await auth.api.getInvitation({
				headers: inviteeHeaders,
				query: { id: inviteResult.invitation.id },
			});

			expect(invitation.inviterEmail).toBeUndefined();
			expect(invitation.email).toBeUndefined();
			expect(invitation.organizationName).toBeDefined();
		});

		it("should include inviterEmail when privacy is disabled", async () => {
			const { auth, signInWithTestUser, signInWithUser } = await defineInstance(
				[
					organization({
						async sendInvitationEmail() {},
					}),
				],
			);
			const { headers, user } = await signInWithTestUser();

			const orgData = getOrganizationData();
			const testOrg = await auth.api.createOrganization({
				headers,
				body: { name: orgData.name, slug: orgData.slug },
			});

			const inviteeEmail = `invitee-${crypto.randomUUID()}@test.com`;
			const inviteePassword = "password123";

			await auth.api.signUpEmail({
				body: {
					email: inviteeEmail,
					password: inviteePassword,
					name: "Invitee User",
				},
			});
			const { headers: inviteeHeaders } = await signInWithUser(
				inviteeEmail,
				inviteePassword,
			);

			const inviteResult = await auth.api.createInvitation({
				headers,
				body: {
					organizationId: testOrg.id,
					email: inviteeEmail,
					role: "member",
				},
			});

			const invitation = await auth.api.getInvitation({
				headers: inviteeHeaders,
				query: { id: inviteResult.invitation.id },
			});

			expect(invitation.inviterEmail).toBe(user.email);
			expect(invitation.email).toBe(inviteeEmail);
		});
	});
});
