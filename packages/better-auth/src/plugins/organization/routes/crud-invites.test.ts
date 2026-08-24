import type { BetterAuthOptions, GenerateIdFn } from "@better-auth/core";
import { describe, expect, it } from "vitest";
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
