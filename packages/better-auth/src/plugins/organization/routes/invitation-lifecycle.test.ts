import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { organization } from "../organization";

async function setupInvitation() {
	const sentInvitationIds: string[] = [];
	const { auth, client, signInWithTestUser, signInWithUser } =
		await getTestInstance(
			{
				plugins: [
					organization({
						async sendInvitationEmail(data) {
							sentInvitationIds.push(data.id);
						},
					}),
				],
			},
			{ clientOptions: { plugins: [organizationClient()] } },
		);
	const ctx = await auth.$context;
	const owner = await signInWithTestUser();
	const recipient = {
		email: "invitation-lifecycle-recipient@example.com",
		name: "Invitation recipient",
		password: "password12345",
	};
	await auth.api.signUpEmail({ body: recipient });
	const recipientSession = await signInWithUser(
		recipient.email,
		recipient.password,
	);
	const organizationRecord = await auth.api.createOrganization({
		headers: owner.headers,
		body: {
			name: "Invitation lifecycle organization",
			slug: "invitation-lifecycle-organization",
		},
	});
	if (!organizationRecord) throw new Error("failed to create organization");
	const invitation = await auth.api.createInvitation({
		headers: owner.headers,
		body: {
			email: recipient.email,
			role: "member",
			organizationId: organizationRecord.id,
		},
	});
	sentInvitationIds.length = 0;
	return {
		auth,
		client,
		ctx,
		invitation,
		organizationRecord,
		ownerHeaders: owner.headers,
		recipient,
		recipientHeaders: recipientSession.headers,
		sentInvitationIds,
	};
}

function installInvitationTransitionBarrier(
	ctx: Awaited<ReturnType<typeof setupInvitation>>["ctx"],
	expectedArrivals = 2,
) {
	const originalIncrementOne = ctx.adapter.incrementOne.bind(
		ctx.adapter,
	) as typeof ctx.adapter.incrementOne;
	let arrivals = 0;
	let release: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	return vi
		.spyOn(ctx.adapter, "incrementOne")
		.mockImplementation(async (data) => {
			if (data.model === "invitation") {
				arrivals += 1;
				if (arrivals === expectedArrivals) release?.();
				await gate;
			}
			return originalIncrementOne(data);
		});
}

async function readInvitation(
	ctx: Awaited<ReturnType<typeof setupInvitation>>["ctx"],
	invitationId: string,
) {
	return ctx.adapter.findOne<{
		id: string;
		status: "pending" | "accepted" | "rejected" | "canceled";
		expiresAt: Date;
	}>({
		model: "invitation",
		where: [{ field: "id", value: invitationId }],
	});
}

async function countRecipientMemberships(
	setup: Awaited<ReturnType<typeof setupInvitation>>,
) {
	const recipient = await setup.ctx.internalAdapter.findUserByEmail(
		setup.recipient.email,
	);
	if (!recipient) throw new Error("recipient not found");
	return setup.ctx.adapter.count({
		model: "member",
		where: [
			{ field: "userId", value: recipient.user.id },
			{
				field: "organizationId",
				value: setup.organizationRecord.id,
			},
		],
	});
}

describe("guarded invitation lifecycle transitions", () => {
	it("does not transition an invitation after it is rejected or canceled", async () => {
		const setup = await setupInvitation();
		const rejected = await setup.auth.api.rejectInvitation({
			headers: setup.recipientHeaders,
			body: { invitationId: setup.invitation.id },
		});
		expect(rejected.invitation?.status).toBe("rejected");
		await expect(
			setup.auth.api.acceptInvitation({
				headers: setup.recipientHeaders,
				body: { invitationId: setup.invitation.id },
			}),
		).rejects.toMatchObject({ body: { code: "INVITATION_NOT_FOUND" } });
		await expect(
			setup.auth.api.cancelInvitation({
				headers: setup.ownerHeaders,
				body: { invitationId: setup.invitation.id },
			}),
		).rejects.toMatchObject({ body: { code: "INVITATION_NOT_FOUND" } });

		const secondInvitation = await setup.auth.api.createInvitation({
			headers: setup.ownerHeaders,
			body: {
				email: setup.recipient.email,
				role: "member",
				organizationId: setup.organizationRecord.id,
			},
		});
		const canceled = await setup.auth.api.cancelInvitation({
			headers: setup.ownerHeaders,
			body: { invitationId: secondInvitation.id },
		});
		expect(canceled.status).toBe("canceled");
		await expect(
			setup.auth.api.rejectInvitation({
				headers: setup.recipientHeaders,
				body: { invitationId: secondInvitation.id },
			}),
		).rejects.toMatchObject({ body: { code: "INVITATION_NOT_FOUND" } });
		expect(await countRecipientMemberships(setup)).toBe(0);
	});

	it.each([
		"reject",
		"cancel",
	] as const)("serializes accept against %s", async (terminalAction) => {
		const setup = await setupInvitation();
		const barrier = installInvitationTransitionBarrier(setup.ctx);
		try {
			const accept = setup.auth.api.acceptInvitation({
				headers: setup.recipientHeaders,
				body: { invitationId: setup.invitation.id },
			});
			const terminal =
				terminalAction === "reject"
					? setup.auth.api.rejectInvitation({
							headers: setup.recipientHeaders,
							body: { invitationId: setup.invitation.id },
						})
					: setup.auth.api.cancelInvitation({
							headers: setup.ownerHeaders,
							body: { invitationId: setup.invitation.id },
						});
			const results = await Promise.allSettled([accept, terminal]);
			expect(
				results.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			expect(
				results.filter((result) => result.status === "rejected"),
			).toHaveLength(1);
		} finally {
			barrier.mockRestore();
		}

		const invitation = await readInvitation(setup.ctx, setup.invitation.id);
		expect(invitation?.status).toMatch(
			terminalAction === "reject"
				? /^(accepted|rejected)$/
				: /^(accepted|canceled)$/,
		);
		expect(await countRecipientMemberships(setup)).toBe(
			invitation?.status === "accepted" ? 1 : 0,
		);
	});

	it("serializes ID-bound resend against cancellation", async () => {
		const setup = await setupInvitation();
		const barrier = installInvitationTransitionBarrier(setup.ctx);
		try {
			const results = await Promise.allSettled([
				setup.auth.api.resendInvitation({
					headers: setup.ownerHeaders,
					body: { invitationId: setup.invitation.id },
				}),
				setup.auth.api.cancelInvitation({
					headers: setup.ownerHeaders,
					body: { invitationId: setup.invitation.id },
				}),
			]);
			expect(
				results.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			expect(
				results.filter((result) => result.status === "rejected"),
			).toHaveLength(1);
		} finally {
			barrier.mockRestore();
		}

		const invitation = await readInvitation(setup.ctx, setup.invitation.id);
		expect(invitation?.status).toMatch(/^(pending|canceled)$/);
		expect(setup.sentInvitationIds).toHaveLength(
			invitation?.status === "pending" ? 1 : 0,
		);
	});

	it("allows only one concurrent resend for the same invitation snapshot", async () => {
		const setup = await setupInvitation();
		const barrier = installInvitationTransitionBarrier(setup.ctx);
		try {
			const results = await Promise.allSettled([
				setup.auth.api.resendInvitation({
					headers: setup.ownerHeaders,
					body: { invitationId: setup.invitation.id },
				}),
				setup.auth.api.resendInvitation({
					headers: setup.ownerHeaders,
					body: { invitationId: setup.invitation.id },
				}),
			]);
			expect(
				results.filter((result) => result.status === "fulfilled"),
			).toHaveLength(1);
			expect(
				results.filter((result) => result.status === "rejected"),
			).toHaveLength(1);
		} finally {
			barrier.mockRestore();
		}
		expect(setup.sentInvitationIds).toEqual([setup.invitation.id]);
	});

	it("replaces an expired pending invite and can renew it by ID", async () => {
		const setup = await setupInvitation();
		const expiredAt = new Date(Date.now() - 60_000);
		await setup.ctx.adapter.update({
			model: "invitation",
			where: [{ field: "id", value: setup.invitation.id }],
			update: { expiresAt: expiredAt },
		});

		const replacement = await setup.auth.api.createInvitation({
			headers: setup.ownerHeaders,
			body: {
				email: setup.recipient.email,
				role: "member",
				organizationId: setup.organizationRecord.id,
			},
		});
		expect(replacement.id).not.toBe(setup.invitation.id);
		expect((await readInvitation(setup.ctx, setup.invitation.id))?.status).toBe(
			"canceled",
		);

		await setup.ctx.adapter.update({
			model: "invitation",
			where: [{ field: "id", value: replacement.id }],
			update: { expiresAt: expiredAt },
		});
		setup.sentInvitationIds.length = 0;
		const renewed = await setup.client.organization.resendInvitation({
			invitationId: replacement.id,
			fetchOptions: { headers: setup.ownerHeaders },
		});
		expect(renewed.error).toBeNull();
		expect(renewed.data?.id).toBe(replacement.id);
		expect(renewed.data?.status).toBe("pending");
		expect(renewed.data?.expiresAt.getTime()).toBeGreaterThan(Date.now());
		expect(setup.sentInvitationIds).toEqual([replacement.id]);
	});
});
