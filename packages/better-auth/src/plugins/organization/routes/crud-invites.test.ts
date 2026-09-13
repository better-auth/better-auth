import type { BetterAuthOptions, GenerateIdFn } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";
import type { OrganizationOptions } from "../types";

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3
 */
describe("organization invitation recipient ownership gates", async () => {
	const VICTIM_EMAIL = "victim@target.example";
	const ATTACKER_PASSWORD = "attacker-password-123";

	type SetupInviteOptions = {
		authOptions?: Partial<BetterAuthOptions>;
		organizationOptions?: OrganizationOptions;
	};

	type AuthOptionsWithAdvancedGenerateId = Partial<BetterAuthOptions> & {
		advanced: NonNullable<Partial<BetterAuthOptions>["advanced"]> & {
			generateId: GenerateIdFn;
		};
	};

	const databaseOwnedIdAuthOptions = {
		advanced: {
			database: {
				generateId: "serial",
			},
		},
	} satisfies Partial<BetterAuthOptions>;

	let customIdSequence = 0;
	const customAdvancedIdAuthOptions = {
		advanced: {
			cookies: {},
			generateId: ({ model }) => `${model}-custom-id-${customIdSequence++}`,
		},
	} satisfies AuthOptionsWithAdvancedGenerateId;

	async function setupInvite({
		authOptions,
		organizationOptions,
	}: SetupInviteOptions = {}) {
		const helpers = await getTestInstance(
			{
				...authOptions,
				plugins: [
					organization(organizationOptions),
					...(authOptions?.plugins ?? []),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { client, signInWithTestUser, cookieSetter } = helpers;
		const { headers: adminHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Acme",
			slug: "acme",
			fetchOptions: {
				headers: adminHeaders,
				onSuccess: cookieSetter(adminHeaders),
			},
		});
		const invite = await client.organization.inviteMember({
			organizationId: org.data!.id,
			email: VICTIM_EMAIL,
			role: "member",
			fetchOptions: { headers: adminHeaders },
		});
		return {
			...helpers,
			adminHeaders,
			orgId: org.data!.id,
			invitationId: String(invite.data!.id!),
		};
	}

	async function signUpUnverifiedRecipient(
		client: Awaited<ReturnType<typeof setupInvite>>["client"],
		signInWithUser: Awaited<ReturnType<typeof setupInvite>>["signInWithUser"],
	) {
		await client.signUp.email({
			email: VICTIM_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "recipient",
		});
		const { headers, res } = await signInWithUser(
			VICTIM_EMAIL,
			ATTACKER_PASSWORD,
		);
		expect(res.user.email).toBe(VICTIM_EMAIL);
		expect(res.user.emailVerified).toBe(false);
		return headers;
	}

	it("accepts an invitation by ID from an unverified matching session by default", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite();
		const recipientHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: recipientHeaders },
		});

		expect(accept.error).toBeNull();
		expect(accept.data?.invitation?.status).toBe("accepted");

		const orgAfter = await auth.api.getFullOrganization({
			headers: adminHeaders,
		});
		const memberEmails = (orgAfter?.members ?? []).map((m) => m.user.email);
		expect(memberEmails).toContain(VICTIM_EMAIL);
	});

	it("marks an invitation rejected by ID from an unverified matching session by default", async () => {
		const { client, signInWithUser, invitationId } = await setupInvite();
		const recipientHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const reject = await client.organization.rejectInvitation({
			invitationId,
			fetchOptions: { headers: recipientHeaders },
		});

		expect(reject.error).toBeNull();
	});

	it("gets an invitation by ID from an unverified matching session by default", async () => {
		const { client, signInWithUser, invitationId } = await setupInvite();
		const recipientHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const got = await client.organization.getInvitation({
			query: { id: invitationId },
			fetchOptions: { headers: recipientHeaders },
		});

		expect(got.error).toBeNull();
		expect(got.data?.email).toBe(VICTIM_EMAIL);
	});

	it("rejects listUserInvitations from an unverified session", async () => {
		const { client, signInWithUser } = await setupInvite();
		const attackerHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const list = await client.organization.listUserInvitations({
			fetchOptions: { headers: attackerHeaders },
		});

		expect(list.data).toBeNull();
		expect(list.error?.status).toBe(403);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3
	 */
	it("keeps listUserInvitations gated when invitation ID verification is disabled", async () => {
		const { client, signInWithUser } = await setupInvite({
			organizationOptions: {
				requireEmailVerificationOnInvitation: false,
			},
		});
		const attackerHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const list = await client.organization.listUserInvitations({
			fetchOptions: { headers: attackerHeaders },
		});

		expect(list.data).toBeNull();
		expect(list.error?.status).toBe(403);
	});

	it("requires verified email for invitation ID calls when explicitly enabled", async () => {
		const acceptSetup = await setupInvite({
			organizationOptions: {
				requireEmailVerificationOnInvitation: true,
			},
		});
		const acceptHeaders = await signUpUnverifiedRecipient(
			acceptSetup.client,
			acceptSetup.signInWithUser,
		);
		const accept = await acceptSetup.client.organization.acceptInvitation({
			invitationId: acceptSetup.invitationId,
			fetchOptions: { headers: acceptHeaders },
		});
		expect(accept.data).toBeNull();
		expect(accept.error?.status).toBe(403);

		const getSetup = await setupInvite({
			organizationOptions: {
				requireEmailVerificationOnInvitation: true,
			},
		});
		const getHeaders = await signUpUnverifiedRecipient(
			getSetup.client,
			getSetup.signInWithUser,
		);
		const got = await getSetup.client.organization.getInvitation({
			query: { id: getSetup.invitationId },
			fetchOptions: { headers: getHeaders },
		});
		expect(got.data).toBeNull();
		expect(got.error?.status).toBe(403);

		const rejectSetup = await setupInvite({
			organizationOptions: {
				requireEmailVerificationOnInvitation: true,
			},
		});
		const rejectHeaders = await signUpUnverifiedRecipient(
			rejectSetup.client,
			rejectSetup.signInWithUser,
		);
		const reject = await rejectSetup.client.organization.rejectInvitation({
			invitationId: rejectSetup.invitationId,
			fetchOptions: { headers: rejectHeaders },
		});
		expect(reject.data).toBeNull();
		expect(reject.error?.status).toBe(403);
	});

	it("requires verified email for invitation ID calls when the database owns IDs", async () => {
		const acceptSetup = await setupInvite({
			authOptions: databaseOwnedIdAuthOptions,
		});
		const acceptHeaders = await signUpUnverifiedRecipient(
			acceptSetup.client,
			acceptSetup.signInWithUser,
		);
		const accept = await acceptSetup.client.organization.acceptInvitation({
			invitationId: acceptSetup.invitationId,
			fetchOptions: { headers: acceptHeaders },
		});
		expect(accept.data).toBeNull();
		expect(accept.error?.status).toBe(403);

		const getSetup = await setupInvite({
			authOptions: databaseOwnedIdAuthOptions,
		});
		const getHeaders = await signUpUnverifiedRecipient(
			getSetup.client,
			getSetup.signInWithUser,
		);
		const got = await getSetup.client.organization.getInvitation({
			query: { id: getSetup.invitationId },
			fetchOptions: { headers: getHeaders },
		});
		expect(got.data).toBeNull();
		expect(got.error?.status).toBe(403);

		const rejectSetup = await setupInvite({
			authOptions: databaseOwnedIdAuthOptions,
		});
		const rejectHeaders = await signUpUnverifiedRecipient(
			rejectSetup.client,
			rejectSetup.signInWithUser,
		);
		const reject = await rejectSetup.client.organization.rejectInvitation({
			invitationId: rejectSetup.invitationId,
			fetchOptions: { headers: rejectHeaders },
		});
		expect(reject.data).toBeNull();
		expect(reject.error?.status).toBe(403);
	});

	it("requires verified email for invitation ID calls when advanced generateId is custom", async () => {
		const { client, signInWithUser, invitationId } = await setupInvite({
			authOptions: customAdvancedIdAuthOptions,
		});
		const recipientHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: recipientHeaders },
		});

		expect(accept.data).toBeNull();
		expect(accept.error?.status).toBe(403);
	});

	it("accepts an invitation by ID with database-owned IDs when verification is explicitly disabled", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite({
				authOptions: databaseOwnedIdAuthOptions,
				organizationOptions: {
					requireEmailVerificationOnInvitation: false,
				},
			});
		const recipientHeaders = await signUpUnverifiedRecipient(
			client,
			signInWithUser,
		);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: recipientHeaders },
		});

		expect(accept.error).toBeNull();
		expect(accept.data?.invitation?.status).toBe("accepted");

		const orgAfter = await auth.api.getFullOrganization({
			headers: adminHeaders,
		});
		const memberEmails = (orgAfter?.members ?? []).map((m) => m.user.email);
		expect(memberEmails).toContain(VICTIM_EMAIL);
	});

	it("accepts the invitation once the recipient verifies their email when verification is required", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite({
				organizationOptions: {
					requireEmailVerificationOnInvitation: true,
				},
			});
		await client.signUp.email({
			email: VICTIM_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "victim",
		});
		const ctx = await auth.$context;
		const victim = await ctx.internalAdapter.findUserByEmail(VICTIM_EMAIL);
		await ctx.internalAdapter.updateUser(victim!.user.id, {
			emailVerified: true,
		});
		const { headers: victimHeaders } = await signInWithUser(
			VICTIM_EMAIL,
			ATTACKER_PASSWORD,
		);

		const list = await client.organization.listUserInvitations({
			fetchOptions: { headers: victimHeaders },
		});
		expect(list.error).toBeNull();
		expect(
			list.data?.some((invitation) => invitation.id === invitationId),
		).toBe(true);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: victimHeaders },
		});

		expect(accept.error).toBeNull();
		expect(accept.data?.invitation?.status).toBe("accepted");

		const orgAfter = await auth.api.getFullOrganization({
			headers: adminHeaders,
		});
		const memberEmails = (orgAfter?.members ?? []).map((m) => m.user.email);
		expect(memberEmails).toContain(VICTIM_EMAIL);
	});
});

/**
 * An invitation's teamId must be scoped to the invitation's organization at
 * creation AND acceptance, and team read endpoints must verify organization
 * membership rather than relying on a teamMember row alone.
 */
describe("invitation teamId must belong to the invitation's organization", async () => {
	const OTHER_USER_EMAIL = "user-b@example.com";
	const INVITEE_EMAIL = "invitee@example.com";
	const PASSWORD = "test-password-123";

	function setup() {
		return getTestInstance(
			{
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: { ...user, emailVerified: true },
							}),
						},
					},
				},
				plugins: [
					organization({
						teams: { enabled: true },
						async sendInvitationEmail() {},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [organizationClient({ teams: { enabled: true } })],
				},
			},
		);
	}

	it("rejects creating an invitation with a teamId from another organization", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter } =
			await setup();

		// First org owner (default test user) creates an org and a team.
		const { headers: ownerHeaders } = await signInWithTestUser();
		const firstOrg = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const firstTeam = await client.organization.createTeam({
			name: "Team A",
			organizationId: firstOrg.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const firstTeamId = firstTeam.data!.id;

		// A second user creates their own organization.
		await client.signUp.email({
			email: OTHER_USER_EMAIL,
			password: PASSWORD,
			name: "User B",
		});
		const { headers: secondUserHeaders } = await signInWithUser(
			OTHER_USER_EMAIL,
			PASSWORD,
		);
		const otherOrg = await client.organization.create({
			name: "Org B",
			slug: "org-b",
			fetchOptions: {
				headers: secondUserHeaders,
				onSuccess: cookieSetter(secondUserHeaders),
			},
		});

		// The second user invites into their own org with a teamId from the first org.
		const invite = await client.organization.inviteMember({
			organizationId: otherOrg.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: firstTeamId,
			fetchOptions: { headers: secondUserHeaders },
		});

		expect(invite.data).toBeNull();
		expect(invite.error?.code).toBe("TEAM_NOT_FOUND");
	});

	it("rejects accepting an invitation whose teamId points at another org", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter, db } =
			await setup();

		// First org + team.
		const { headers: ownerHeaders } = await signInWithTestUser();
		const firstOrg = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const firstTeam = await client.organization.createTeam({
			name: "Team A",
			organizationId: firstOrg.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const firstTeamId = firstTeam.data!.id;

		// Second org with its OWN team so the invitation passes the create-side check.
		await client.signUp.email({
			email: OTHER_USER_EMAIL,
			password: PASSWORD,
			name: "User B",
		});
		const { headers: secondUserHeaders } = await signInWithUser(
			OTHER_USER_EMAIL,
			PASSWORD,
		);
		const otherOrg = await client.organization.create({
			name: "Org B",
			slug: "org-b",
			fetchOptions: {
				headers: secondUserHeaders,
				onSuccess: cookieSetter(secondUserHeaders),
			},
		});
		const otherTeam = await client.organization.createTeam({
			name: "Team B",
			organizationId: otherOrg.data!.id,
			fetchOptions: { headers: secondUserHeaders },
		});

		const invite = await client.organization.inviteMember({
			organizationId: otherOrg.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: otherTeam.data!.id,
			fetchOptions: { headers: secondUserHeaders },
		});
		const invitationId = String(invite.data!.id);

		// Update the persisted invitation directly in the database to point at
		// the first org's team, standing in for a stale or moved team that the
		// create-side check did not cover.
		await db.update({
			model: "invitation",
			where: [{ field: "id", value: invitationId }],
			update: { teamId: firstTeamId },
		});

		// The invited recipient accepts.
		await client.signUp.email({
			email: INVITEE_EMAIL,
			password: PASSWORD,
			name: "Invitee",
		});
		const { headers: inviteeHeaders } = await signInWithUser(
			INVITEE_EMAIL,
			PASSWORD,
		);
		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: inviteeHeaders },
		});

		expect(accept.error?.code).toBe("TEAM_NOT_FOUND");

		// No teamMember row may exist against the first org's team.
		const firstTeamMembers = await db.findMany({
			model: "teamMember",
			where: [{ field: "teamId", value: firstTeamId }],
		});
		expect(firstTeamMembers.length).toBe(0);
	});

	it("uses the accepted invitation team ids if they change after the initial read", async () => {
		const PASSWORD = "test-password-123";
		const INVITEE_EMAIL = "accepted-row-invitee@example.com";
		let db: Awaited<ReturnType<typeof getTestInstance>>["db"];
		let replacementTeamId = "";

		const instance = await getTestInstance(
			{
				databaseHooks: {
					user: {
						create: {
							before: async (user) => ({
								data: { ...user, emailVerified: true },
							}),
						},
					},
				},
				plugins: [
					organization({
						teams: { enabled: true },
						async sendInvitationEmail() {},
						organizationHooks: {
							beforeAcceptInvitation: async ({ invitation }) => {
								await db.update({
									model: "invitation",
									where: [{ field: "id", value: invitation.id }],
									update: { teamId: replacementTeamId },
								});
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [organizationClient({ teams: { enabled: true } })],
				},
			},
		);
		db = instance.db;
		const { client, signInWithTestUser, signInWithUser, cookieSetter } =
			instance;

		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const staleTeam = await client.organization.createTeam({
			name: "Stale Team",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const currentTeam = await client.organization.createTeam({
			name: "Current Team",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		replacementTeamId = currentTeam.data!.id;

		const invite = await client.organization.inviteMember({
			organizationId: org.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: staleTeam.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const invitationId = String(invite.data!.id);

		await client.signUp.email({
			email: INVITEE_EMAIL,
			password: PASSWORD,
			name: "Invitee",
		});
		const { headers: inviteeHeaders, res: inviteeRes } = await signInWithUser(
			INVITEE_EMAIL,
			PASSWORD,
		);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: inviteeHeaders },
		});

		expect(accept.error).toBeNull();
		expect(accept.data?.invitation.teamId).toBe(currentTeam.data!.id);

		const teamMembers = await db.findMany<{ teamId: string }>({
			model: "teamMember",
			where: [{ field: "userId", value: inviteeRes.user.id }],
		});
		expect(teamMembers.map((m) => m.teamId)).toEqual([currentTeam.data!.id]);
	});

	it("keeps the invitation pending when a referenced team no longer exists", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter, db } =
			await setup();

		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const invitedTeam = await client.organization.createTeam({
			name: "Team A",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		await client.organization.createTeam({
			name: "Team B",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});

		const invite = await client.organization.inviteMember({
			organizationId: org.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: invitedTeam.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const invitationId = String(invite.data!.id);

		await db.delete({
			model: "team",
			where: [{ field: "id", value: invitedTeam.data!.id }],
		});

		await client.signUp.email({
			email: INVITEE_EMAIL,
			password: PASSWORD,
			name: "Invitee",
		});
		const { headers: inviteeHeaders } = await signInWithUser(
			INVITEE_EMAIL,
			PASSWORD,
		);
		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: inviteeHeaders },
		});

		expect(accept.error?.code).toBe("TEAM_NOT_FOUND");

		const invitationAfter = await db.findOne<{ status: string }>({
			model: "invitation",
			where: [{ field: "id", value: invitationId }],
		});
		expect(invitationAfter?.status).toBe("pending");
	});

	it("clears the removed team from a pending invitation so it degrades to an organization-level invitation", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter, db } =
			await setup();

		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const invitedTeam = await client.organization.createTeam({
			name: "Team A",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		await client.organization.createTeam({
			name: "Team B",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});

		const invite = await client.organization.inviteMember({
			organizationId: org.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: invitedTeam.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const invitationId = String(invite.data!.id);

		const removed = await client.organization.removeTeam({
			teamId: invitedTeam.data!.id,
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		expect(removed.error).toBeNull();

		const invitationAfter = await db.findOne<{
			status: string;
			teamId: string | null;
		}>({
			model: "invitation",
			where: [{ field: "id", value: invitationId }],
		});
		expect(invitationAfter?.status).toBe("pending");
		expect(invitationAfter?.teamId ?? null).toBeNull();

		await client.signUp.email({
			email: INVITEE_EMAIL,
			password: PASSWORD,
			name: "Invitee",
		});
		const { headers: inviteeHeaders, res: inviteeRes } = await signInWithUser(
			INVITEE_EMAIL,
			PASSWORD,
		);
		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: inviteeHeaders },
		});

		expect(accept.error).toBeNull();
		expect(accept.data?.member).toBeDefined();

		const teamMembers = await db.findMany({
			model: "teamMember",
			where: [{ field: "userId", value: inviteeRes.user.id }],
		});
		expect(teamMembers.length).toBe(0);
	});

	it("keeps the remaining teams on a multi-team invitation when one team is removed", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter, db } =
			await setup();

		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const teamA = await client.organization.createTeam({
			name: "Team A",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const teamB = await client.organization.createTeam({
			name: "Team B",
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});

		const invite = await client.organization.inviteMember({
			organizationId: org.data!.id,
			email: INVITEE_EMAIL,
			role: "member",
			teamId: [teamA.data!.id, teamB.data!.id],
			fetchOptions: { headers: ownerHeaders },
		});
		const invitationId = String(invite.data!.id);

		const removed = await client.organization.removeTeam({
			teamId: teamA.data!.id,
			organizationId: org.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		expect(removed.error).toBeNull();

		const invitationAfter = await db.findOne<{
			status: string;
			teamId: string | null;
		}>({
			model: "invitation",
			where: [{ field: "id", value: invitationId }],
		});
		expect(invitationAfter?.status).toBe("pending");
		expect(invitationAfter?.teamId).toBe(teamB.data!.id);

		await client.signUp.email({
			email: INVITEE_EMAIL,
			password: PASSWORD,
			name: "Invitee",
		});
		const { headers: inviteeHeaders, res: inviteeRes } = await signInWithUser(
			INVITEE_EMAIL,
			PASSWORD,
		);
		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: inviteeHeaders },
		});

		expect(accept.error).toBeNull();

		const teamMembers = await db.findMany<{ teamId: string }>({
			model: "teamMember",
			where: [{ field: "userId", value: inviteeRes.user.id }],
		});
		expect(teamMembers.map((m) => m.teamId)).toEqual([teamB.data!.id]);
	});

	it("does not list another organization's team members from a mismatched teamMember row", async () => {
		const { client, signInWithTestUser, signInWithUser, cookieSetter, db } =
			await setup();

		// First org + team.
		const { headers: ownerHeaders } = await signInWithTestUser();
		const firstOrg = await client.organization.create({
			name: "Org A",
			slug: "org-a",
			fetchOptions: {
				headers: ownerHeaders,
				onSuccess: cookieSetter(ownerHeaders),
			},
		});
		const firstTeam = await client.organization.createTeam({
			name: "Team A",
			organizationId: firstOrg.data!.id,
			fetchOptions: { headers: ownerHeaders },
		});
		const firstTeamId = firstTeam.data!.id;

		// The second user is NOT a member of the first organization.
		await client.signUp.email({
			email: OTHER_USER_EMAIL,
			password: PASSWORD,
			name: "User B",
		});
		const { headers: secondUserHeaders, res: secondUserRes } =
			await signInWithUser(OTHER_USER_EMAIL, PASSWORD);

		// Insert a teamMember row directly in the database tying the second user
		// to the first org's team, standing in for a stale or mismatched row.
		await db.create({
			model: "teamMember",
			data: {
				teamId: firstTeamId,
				userId: secondUserRes.user.id,
				createdAt: new Date(),
			},
		});

		const list = await client.organization.listTeamMembers({
			query: { teamId: firstTeamId },
			fetchOptions: { headers: secondUserHeaders },
		});

		expect(list.data).toBeNull();
		expect(list.error?.code).toBe("USER_IS_NOT_A_MEMBER_OF_THE_TEAM");
	});
});

type EnrollmentEmailData = {
	user: { id: string; email: string };
	token: string;
	invitation?: { organizationName: string; inviterEmail: string };
};

describe("organization invitations integrate with passwordless enrollment", async () => {
	function setup(
		sendEnrollmentVerification?: (data: EnrollmentEmailData) => Promise<void>,
	) {
		return getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						sendEnrollmentVerification:
							sendEnrollmentVerification ?? (async () => {}),
					},
				},
				plugins: [
					organization({
						async sendInvitationEmail() {},
					}),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
	}

	async function createOrg(
		client: Awaited<ReturnType<typeof setup>>["client"],
		signInWithTestUser: Awaited<ReturnType<typeof setup>>["signInWithTestUser"],
	) {
		const { headers } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Acme",
			slug: "acme",
			fetchOptions: { headers },
		});
		return { headers, orgId: org.data!.id };
	}

	it("sends only the enrollment email, with invitation context, for an email with no account yet", async () => {
		const sendInvitationEmail = vi.fn();
		let enrollmentData: EnrollmentEmailData | undefined;
		const { client, signInWithTestUser } = await getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						async sendEnrollmentVerification(data) {
							enrollmentData = data;
						},
					},
				},
				plugins: [organization({ sendInvitationEmail })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		await client.organization.inviteMember({
			organizationId: orgId,
			email: "brand-new@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		expect(sendInvitationEmail).not.toHaveBeenCalled();
		expect(enrollmentData?.user.email).toBe("brand-new@example.com");
		expect(enrollmentData?.invitation).toMatchObject({
			organizationName: "Acme",
			inviterEmail: "test@test.com",
		});
	});

	it("sends the normal invitation email for an email that already has a verified account", async () => {
		const sendInvitationEmail = vi.fn();
		const sendEnrollmentVerification = vi.fn();
		const { client, signInWithTestUser, db } = await getTestInstance(
			{
				user: { enrollment: { enabled: true, sendEnrollmentVerification } },
				plugins: [organization({ sendInvitationEmail })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		await client.signUp.email({
			email: "verified@example.com",
			password: "verified-password-123",
			name: "Verified",
		});
		await db.update({
			model: "user",
			where: [{ field: "email", value: "verified@example.com" }],
			update: { emailVerified: true },
		});

		await client.organization.inviteMember({
			organizationId: orgId,
			email: "verified@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		expect(sendInvitationEmail).toHaveBeenCalledOnce();
		expect(sendEnrollmentVerification).not.toHaveBeenCalled();
	});

	it("still sends the enrollment email, reusing the row, for an email pre-squatted by an unverified sign-up", async () => {
		const sendInvitationEmail = vi.fn();
		let enrollmentData: EnrollmentEmailData | undefined;
		const { client, signInWithTestUser, db } = await getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						async sendEnrollmentVerification(data) {
							enrollmentData = data;
						},
					},
				},
				plugins: [organization({ sendInvitationEmail })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		const signUpRes = await client.signUp.email({
			email: "squatted@example.com",
			password: "attacker-password-123",
			name: "attacker",
		});

		await client.organization.inviteMember({
			organizationId: orgId,
			email: "squatted@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		expect(sendInvitationEmail).not.toHaveBeenCalled();
		expect(enrollmentData?.user.id).toBe(signUpRes.data!.user.id);

		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "squatted@example.com" }],
		});
		expect(users).toHaveLength(1);
	});

	it("getInvitationPreview returns non-sensitive display fields without a session", async () => {
		const { client, auth, signInWithTestUser } = await setup();
		const { headers, orgId } = await createOrg(client, signInWithTestUser);
		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: "previewed@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		const preview = await auth.api.getInvitationPreview({
			query: { id: String(invite.data!.id) },
		});
		expect(preview).toMatchObject({
			organizationName: "Acme",
			inviterEmail: "test@test.com",
			role: "member",
			status: "pending",
		});
		expect(preview).not.toHaveProperty("email");
		expect(preview).not.toHaveProperty("id");
		expect(preview).not.toHaveProperty("organizationId");
	});

	it("getInvitationPreview rejects an unknown invitation id", async () => {
		const { auth } = await setup();
		await expect(
			auth.api.getInvitationPreview({ query: { id: "does-not-exist" } }),
		).rejects.toThrow();
	});

	it("completing enrollment for an invite-linked token also accepts the invitation atomically", async () => {
		let token = "";
		const { client, signInWithTestUser, db } = await setup(async (data) => {
			token = data.token;
		});
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		await client.organization.inviteMember({
			organizationId: orgId,
			email: "auto-accept@example.com",
			role: "member",
			fetchOptions: { headers },
		});
		expect(token.length).toBe(32);

		const res = await client.enroll.callback({
			token,
			password: "auto-accept-password-123",
		});
		expect(res.data?.user.email).toBe("auto-accept@example.com");

		const members = await db.findMany({
			model: "member",
			where: [
				{ field: "organizationId", value: orgId },
				{ field: "userId", value: res.data!.user.id },
			],
		});
		expect(members).toHaveLength(1);

		const invitations = await db.findMany({
			model: "invitation",
			where: [{ field: "organizationId", value: orgId }],
		});
		expect(
			(invitations as { status: string }[]).every(
				(i) => i.status === "accepted",
			),
		).toBe(true);
	});

	it("resending an invitation to a not-yet-registered email also sends only the enrollment email", async () => {
		const sendInvitationEmail = vi.fn();
		let enrollmentCallCount = 0;
		let lastToken = "";
		const { client, signInWithTestUser, db } = await getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						async sendEnrollmentVerification(data) {
							enrollmentCallCount++;
							lastToken = data.token;
						},
					},
				},
				plugins: [organization({ sendInvitationEmail })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		await client.organization.inviteMember({
			organizationId: orgId,
			email: "resend-me@example.com",
			role: "member",
			fetchOptions: { headers },
		});
		const firstToken = lastToken;

		const resendRes = await client.organization.inviteMember({
			organizationId: orgId,
			email: "resend-me@example.com",
			role: "member",
			resend: true,
			fetchOptions: { headers },
		});

		expect(resendRes.error).toBeNull();
		expect(sendInvitationEmail).not.toHaveBeenCalled();
		expect(enrollmentCallCount).toBe(2);
		expect(lastToken).not.toBe(firstToken);

		// Only one pending user was created, not one per resend.
		const users = await db.findMany({
			model: "user",
			where: [{ field: "email", value: "resend-me@example.com" }],
		});
		expect(users).toHaveLength(1);

		// The newest token still completes enrollment and accepts the invite.
		const completed = await client.enroll.callback({
			token: lastToken,
			password: "resend-password-123",
		});
		expect(completed.data?.user.email).toBe("resend-me@example.com");
	});

	it("the pre-resend token still completes enrollment and auto-accepts the invitation", async () => {
		let firstToken = "";
		let lastToken = "";
		const { client, signInWithTestUser, db } = await getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						async sendEnrollmentVerification(data) {
							if (!firstToken) {
								firstToken = data.token;
							} else {
								lastToken = data.token;
							}
						},
					},
				},
				plugins: [organization({ sendInvitationEmail: async () => {} })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: "old-token-wins@example.com",
			role: "member",
			fetchOptions: { headers },
		});
		await client.organization.inviteMember({
			organizationId: orgId,
			email: "old-token-wins@example.com",
			role: "member",
			resend: true,
			fetchOptions: { headers },
		});
		expect(firstToken.length).toBe(32);
		expect(lastToken.length).toBe(32);

		// Use the FIRST (pre-resend) token, not the newest one.
		const completed = await client.enroll.callback({
			token: firstToken,
			password: "old-token-password-123",
		});
		expect(completed.data?.user.email).toBe("old-token-wins@example.com");

		const members = await db.findMany({
			model: "member",
			where: [
				{ field: "organizationId", value: orgId },
				{ field: "userId", value: completed.data!.user.id },
			],
		});
		expect(members).toHaveLength(1);

		const [invitation] = await db.findMany({
			model: "invitation",
			where: [{ field: "id", value: String(invite.data!.id) }],
		});
		expect((invitation as { status: string }).status).toBe("accepted");

		// The now-stale newest token is a dead link: the account it targets
		// is already enrolled and verified, so the core "already verified
		// elsewhere" guard rejects it rather than linking a second
		// credential account.
		const staleAttempt = await client.enroll.callback({
			token: lastToken,
			password: "should-not-matter-123",
		});
		expect(staleAttempt.error?.status).toBe(400);
	});

	it("getInvitationPreview rejects an invitation that is no longer pending", async () => {
		const { client, auth, signInWithTestUser } = await setup();
		const { headers, orgId } = await createOrg(client, signInWithTestUser);
		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: "already-accepted@example.com",
			role: "member",
			fetchOptions: { headers },
		});
		const invitationId = String(invite.data!.id);

		await client.organization.cancelInvitation({
			invitationId,
			fetchOptions: { headers },
		});

		await expect(
			auth.api.getInvitationPreview({ query: { id: invitationId } }),
		).rejects.toThrow();
	});

	/**
	 * Found in an independent re-review: the auto-accept hook peeked and
	 * consumed its linking row before calling acceptInvitation, so a
	 * legitimate failure there (membership limit reached) burned the
	 * linkage with no way to retry it. Enrollment must still succeed --
	 * the account is real and correctly set up -- and since
	 * acceptInvitation only flips the invitation to "accepted" after every
	 * check passes, it must still be sitting there "pending" for the
	 * now-signed-in user to accept normally afterward.
	 */
	it("still completes enrollment when the auto-accept fails for a legitimate reason (membership limit)", async () => {
		let token = "";
		const { client, signInWithTestUser, db } = await getTestInstance(
			{
				user: {
					enrollment: {
						enabled: true,
						async sendEnrollmentVerification(data) {
							token = data.token;
						},
					},
				},
				plugins: [
					organization({
						sendInvitationEmail: async () => {},
						membershipLimit: 1,
					}),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);

		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: "no-room@example.com",
			role: "member",
			fetchOptions: { headers },
		});
		expect(token.length).toBe(32);

		const completed = await client.enroll.callback({
			token,
			password: "no-room-password-123",
		});
		expect(completed.data?.user.email).toBe("no-room@example.com");

		const [invitation] = await db.findMany({
			model: "invitation",
			where: [{ field: "id", value: String(invite.data!.id) }],
		});
		expect((invitation as { status: string }).status).toBe("pending");

		const members = await db.findMany({
			model: "member",
			where: [
				{ field: "organizationId", value: orgId },
				{ field: "userId", value: completed.data!.user.id },
			],
		});
		expect(members).toHaveLength(0);
	});

	/**
	 * Found in a security review: getInvitationPreview has no session to
	 * gate on, unlike acceptInvitation/rejectInvitation/getInvitation, so
	 * it relied entirely on invitation ids being unguessable. Under a
	 * non-opaque id (serial, DB-assigned, or a predictable custom
	 * generator) they aren't, letting an unauthenticated caller enumerate
	 * small integers to harvest org names and inviters' real emails --
	 * the exact exposure class GHSA-fmh4-wcc4-5jm3 already fixed for the
	 * other three by-ID invitation endpoints.
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3
	 */
	it("getInvitationPreview refuses to serve when invitation ids are not opaque", async () => {
		const { client, signInWithTestUser } = await getTestInstance(
			{
				advanced: { database: { generateId: "serial" } },
				user: {
					enrollment: {
						enabled: true,
						sendEnrollmentVerification: async () => {},
					},
				},
				plugins: [organization({ sendInvitationEmail: async () => {} })],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { headers, orgId } = await createOrg(client, signInWithTestUser);
		const invite = await client.organization.inviteMember({
			organizationId: orgId,
			email: "guessable-id@example.com",
			role: "member",
			fetchOptions: { headers },
		});

		const preview = await client.organization.getInvitationPreview({
			query: { id: String(invite.data!.id) },
		});
		expect(preview.data).toBeNull();
		expect(preview.error?.status).toBe(400);
	});
});
