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

	async function setupInvite(organizationOptions?: OrganizationOptions) {
		const helpers = await getTestInstance(
			{ plugins: [organization(organizationOptions)] },
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

	it("accepts acceptInvitation by invitationId from an unverified matching session by default", async () => {
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

	it("accepts rejectInvitation by invitationId from an unverified matching session by default", async () => {
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

	it("accepts getInvitation by invitationId from an unverified matching session by default", async () => {
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
	it("keeps listUserInvitations gated when token-bearing verification is disabled", async () => {
		const { client, signInWithUser } = await setupInvite({
			requireEmailVerificationOnInvitation: false,
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

	it("requires verified email for token-bearing calls when explicitly enabled", async () => {
		const acceptSetup = await setupInvite({
			requireEmailVerificationOnInvitation: true,
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
			requireEmailVerificationOnInvitation: true,
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
			requireEmailVerificationOnInvitation: true,
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

	it("accepts the invitation once the recipient verifies their email when verification is required", async () => {
		const { client, signInWithUser, invitationId, auth, adminHeaders } =
			await setupInvite({ requireEmailVerificationOnInvitation: true });
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
