import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";

/**
 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3
 */
describe("organization invitation recipient gate requires emailVerified", async () => {
	const VICTIM_EMAIL = "victim@target.example";
	const ATTACKER_PASSWORD = "attacker-password-123";

	async function setupInvite() {
		const helpers = await getTestInstance(
			{ plugins: [organization()] },
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
			invitationId: invite.data!.id!,
		};
	}

	async function signUpUnverifiedVictim(
		client: Awaited<ReturnType<typeof setupInvite>>["client"],
		signInWithUser: Awaited<ReturnType<typeof setupInvite>>["signInWithUser"],
	) {
		await client.signUp.email({
			email: VICTIM_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "attacker",
		});
		const { headers, res } = await signInWithUser(
			VICTIM_EMAIL,
			ATTACKER_PASSWORD,
		);
		expect(res.user.email).toBe(VICTIM_EMAIL);
		expect(res.user.emailVerified).toBe(false);
		return headers;
	}

	it("rejects acceptInvitation from an unverified session that matches the invitation email", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite();
		const attackerHeaders = await signUpUnverifiedVictim(
			client,
			signInWithUser,
		);

		const accept = await client.organization.acceptInvitation({
			invitationId,
			fetchOptions: { headers: attackerHeaders },
		});

		expect(accept.data).toBeNull();
		expect(accept.error?.status).toBe(403);

		const orgAfter = await auth.api.getFullOrganization({
			headers: adminHeaders,
		});
		const memberEmails = (orgAfter?.members ?? []).map((m) => m.user.email);
		expect(memberEmails).not.toContain(VICTIM_EMAIL);
	});

	it("rejects rejectInvitation from an unverified session that matches the invitation email", async () => {
		const { client, signInWithUser, invitationId } = await setupInvite();
		const attackerHeaders = await signUpUnverifiedVictim(
			client,
			signInWithUser,
		);

		const reject = await client.organization.rejectInvitation({
			invitationId,
			fetchOptions: { headers: attackerHeaders },
		});

		expect(reject.data).toBeNull();
		expect(reject.error?.status).toBe(403);
	});

	it("rejects getInvitation from an unverified session that matches the invitation email", async () => {
		const { client, signInWithUser, invitationId } = await setupInvite();
		const attackerHeaders = await signUpUnverifiedVictim(
			client,
			signInWithUser,
		);

		const got = await client.organization.getInvitation({
			query: { id: invitationId },
			fetchOptions: { headers: attackerHeaders },
		});

		expect(got.data).toBeNull();
		expect(got.error?.status).toBe(403);
	});

	it("rejects listUserInvitations from an unverified session", async () => {
		const { client, signInWithUser } = await setupInvite();
		const attackerHeaders = await signUpUnverifiedVictim(
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
	it("respects requireEmailVerificationOnInvitation: false (legacy permissive opt-out)", async () => {
		const helpers = await getTestInstance(
			{
				plugins: [
					organization({ requireEmailVerificationOnInvitation: false }),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { client, signInWithTestUser, signInWithUser, cookieSetter } =
			helpers;
		const { headers: adminHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Permissive Org",
			slug: "permissive-org",
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
		await client.signUp.email({
			email: VICTIM_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "unverified",
		});
		const { headers: unverifiedHeaders } = await signInWithUser(
			VICTIM_EMAIL,
			ATTACKER_PASSWORD,
		);

		// Read-side endpoints should also ignore the gate when opted out so the
		// option is consistent across the four documented recipient calls.
		const got = await client.organization.getInvitation({
			query: { id: invite.data!.id! },
			fetchOptions: { headers: unverifiedHeaders },
		});
		expect(got.error).toBeNull();
		expect(got.data?.email).toBe(VICTIM_EMAIL);

		const list = await client.organization.listUserInvitations({
			fetchOptions: { headers: unverifiedHeaders },
		});
		expect(list.error).toBeNull();
		expect(list.data?.length ?? 0).toBeGreaterThanOrEqual(1);

		const accept = await client.organization.acceptInvitation({
			invitationId: invite.data!.id!,
			fetchOptions: { headers: unverifiedHeaders },
		});
		expect(accept.error).toBeNull();
		expect(accept.data?.invitation?.status).toBe("accepted");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-fmh4-wcc4-5jm3
	 */
	it("respects opt-out on rejectInvitation", async () => {
		const helpers = await getTestInstance(
			{
				plugins: [
					organization({ requireEmailVerificationOnInvitation: false }),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
		const { client, signInWithTestUser, signInWithUser, cookieSetter } =
			helpers;
		const { headers: adminHeaders } = await signInWithTestUser();
		const org = await client.organization.create({
			name: "Permissive Reject Org",
			slug: "permissive-reject",
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
		await client.signUp.email({
			email: VICTIM_EMAIL,
			password: ATTACKER_PASSWORD,
			name: "unverified",
		});
		const { headers: unverifiedHeaders } = await signInWithUser(
			VICTIM_EMAIL,
			ATTACKER_PASSWORD,
		);

		const reject = await client.organization.rejectInvitation({
			invitationId: invite.data!.id!,
			fetchOptions: { headers: unverifiedHeaders },
		});
		expect(reject.error).toBeNull();
	});

	it("accepts the invitation once the recipient verifies their email", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite();
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
