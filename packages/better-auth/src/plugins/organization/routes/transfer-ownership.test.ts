import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../../test-utils/test-instance";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

/**
 * @see https://github.com/better-auth/better-auth/issues/10748
 */
describe("transferOwnership", () => {
	it("swaps ownership immediately when no confirmation is configured", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const owner = await auth.api.getActiveMember({ headers });

		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		const result = await auth.api.transferOwnership({
			body: {
				organizationId: org!.id,
				newOwnerMemberId: newOwnerMember!.id,
			},
			headers,
		});
		if (!("newOwner" in result)) throw new Error("expected an immediate swap");
		expect(result.newOwner.role).toBe("owner");
		expect(result.previousOwner.role).toBe("member");
		expect(result.previousOwner.id).toBe(owner!.id);
	});

	it("instant mode: emails the current owner and only swaps after the callback token is consumed", async () => {
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					ownershipTransfer: {
						async sendTransferOwnershipVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		const requestRes = await auth.api.transferOwnership({
			body: { organizationId: org!.id, newOwnerMemberId: newOwnerMember!.id },
			headers,
		});
		expect(requestRes).toMatchObject({
			success: true,
			message: "Verification email sent",
		});
		expect(capturedToken.length).toBe(32);

		// Not swapped yet.
		const stillOwner = await auth.api.getActiveMember({ headers });
		expect(stillOwner!.role).toBe("owner");

		const callbackRes = await auth.api.transferOwnershipCallback({
			query: { token: capturedToken },
			headers,
		});
		expect(callbackRes.newOwner.id).toBe(newOwnerMember!.id);
		expect(callbackRes.newOwner.role).toBe("owner");

		const demoted = await auth.api.getActiveMember({ headers });
		expect(demoted!.role).toBe("member");
	});

	it("explicit mode: preview doesn't swap, confirm applies it", async () => {
		let capturedUrl = "";
		let capturedToken = "";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					ownershipTransfer: {
						confirmationMode: "explicit",
						async sendTransferOwnershipVerification({ url, token }) {
							capturedUrl = url;
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		await auth.api.transferOwnership({
			body: {
				organizationId: org!.id,
				newOwnerMemberId: newOwnerMember!.id,
				callbackURL: "https://app.example.com/org/settings",
			},
			headers,
		});

		// The emailed link is app-owned, not better-auth's own GET callback.
		expect(capturedUrl.startsWith("https://app.example.com/org/settings")).toBe(
			true,
		);
		expect(capturedUrl).not.toContain(
			"/organization/transfer-ownership/callback",
		);

		const preview = await auth.api.transferOwnershipPreview({
			query: { token: capturedToken },
			headers,
		});
		expect(preview.newOwner.id).toBe(newOwnerMember!.id);

		const stillOwner = await auth.api.getActiveMember({ headers });
		expect(stillOwner!.role).toBe("owner");

		const confirmed = await auth.api.transferOwnershipConfirm({
			body: { token: capturedToken },
			headers,
		});
		expect(confirmed.newOwner.role).toBe("owner");

		const demoted = await auth.api.getActiveMember({ headers });
		expect(demoted!.role).toBe("member");
	});

	it("rejects transferring to a member outside the organization", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const otherOrg = await auth.api.createOrganization({
			body: { name: "Other", slug: "other" },
			headers,
		});
		const outsideMember = await auth.api.getActiveMember({
			headers,
			query: { organizationId: otherOrg!.id },
		});

		await expect(
			auth.api.transferOwnership({
				body: {
					organizationId: org!.id,
					newOwnerMemberId: outsideMember!.id,
				},
				headers,
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.MEMBER_NOT_FOUND.message);
	});

	it("rejects transferring ownership to yourself", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const owner = await auth.api.getActiveMember({ headers });

		await expect(
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: owner!.id },
				headers,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.YOU_CANNOT_TRANSFER_OWNERSHIP_TO_YOURSELF
				.message,
		);
	});

	it("rejects transferring ownership when the target is already the owner", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "co-owner@test.com",
				name: "Co Owner",
				password: "password",
			},
		});
		const coOwner = await auth.api.addMember({
			body: { organizationId: org!.id, userId: newUser.user.id, role: "owner" },
		});

		await expect(
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: coOwner!.id },
				headers,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.TARGET_MEMBER_IS_ALREADY_THE_OWNER.message,
		);
	});

	it("rejects transferring ownership when the caller has no member:update permission", async () => {
		const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers: ownerHeaders,
		});

		// A plain "member" has neither the creator shortcut nor member:update.
		const plainUser = await auth.api.signUpEmail({
			body: { email: "plain@test.com", name: "Plain", password: "password" },
		});
		await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: plainUser.user.id,
				role: "member",
			},
		});
		const { headers: plainHeaders } = await signInWithUser(
			"plain@test.com",
			"password",
		);

		const targetUser = await auth.api.signUpEmail({
			body: { email: "target@test.com", name: "Target", password: "password" },
		});
		const targetMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: targetUser.user.id,
				role: "member",
			},
		});

		await expect(
			auth.api.transferOwnership({
				body: {
					organizationId: org!.id,
					newOwnerMemberId: targetMember!.id,
				},
				headers: plainHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.YOU_ARE_NOT_ALLOWED_TO_TRANSFER_OWNERSHIP_OF_THIS_ORGANIZATION.message,
		);
	});

	it("fires beforeTransferOwnership and afterTransferOwnership hooks", async () => {
		const beforeTransferOwnership = vi.fn();
		const afterTransferOwnership = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeTransferOwnership,
						afterTransferOwnership,
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		await auth.api.transferOwnership({
			body: { organizationId: org!.id, newOwnerMemberId: newOwnerMember!.id },
			headers,
		});

		expect(beforeTransferOwnership).toHaveBeenCalledOnce();
		expect(beforeTransferOwnership).toHaveBeenCalledWith(
			expect.objectContaining({
				organization: expect.objectContaining({ id: org!.id }),
				currentOwner: expect.objectContaining({ role: "owner" }),
				newOwner: expect.objectContaining({ id: newOwnerMember!.id }),
			}),
			expect.anything(),
		);
		expect(afterTransferOwnership).toHaveBeenCalledOnce();
		expect(afterTransferOwnership).toHaveBeenCalledWith(
			expect.objectContaining({
				organization: expect.objectContaining({ id: org!.id }),
				previousOwner: expect.objectContaining({ role: "member" }),
				newOwner: expect.objectContaining({ role: "owner" }),
			}),
			expect.anything(),
		);
	});

	// The transfer token is single-use: two concurrent callbacks with the
	// same token must apply the swap exactly once. Whichever request consumes
	// the verification row first wins; the loser sees an invalid token.
	it("transfers ownership only once when the same token is used concurrently", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					ownershipTransfer: {
						async sendTransferOwnershipVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		await auth.api.transferOwnership({
			body: { organizationId: org!.id, newOwnerMemberId: newOwnerMember!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		const [first, second] = await Promise.allSettled([
			auth.api.transferOwnershipCallback({
				query: { token: capturedToken },
				headers,
			}),
			auth.api.transferOwnershipCallback({
				query: { token: capturedToken },
				headers,
			}),
		]);
		const successes = [first, second].filter((r) => r.status === "fulfilled");
		const failures = [first, second].filter((r) => r.status === "rejected");
		expect(successes.length).toBe(1);
		expect(failures.length).toBe(1);

		const remaining = await db.findMany({
			model: "verification",
			where: [
				{
					field: "identifier",
					value: `transfer-ownership-${capturedToken}`,
				},
			],
		});
		expect(remaining.length).toBe(0);
	});

	it("rejects the callback once the caller's transfer permission has been revoked", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					ownershipTransfer: {
						async sendTransferOwnershipVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const owner = await auth.api.getActiveMember({ headers });
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		await auth.api.transferOwnership({
			body: { organizationId: org!.id, newOwnerMemberId: newOwnerMember!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		// Demote the requester below member:update after the email was sent
		// but before the link is clicked. They're still the (stale) creator
		// role holder in the token, so this exercises the re-check.
		await db.update({
			model: "member",
			update: { role: "member" },
			where: [{ field: "id", value: owner!.id }],
		});

		await expect(
			auth.api.transferOwnershipCallback({
				query: { token: capturedToken },
				headers,
			}),
		).rejects.toThrow();

		const stillOwner = await db.findOne({
			model: "member",
			where: [{ field: "id", value: owner!.id }],
		});
		expect((stillOwner as { role: string } | null)?.role).toBe("member");
		const stillTarget = await db.findOne({
			model: "member",
			where: [{ field: "id", value: newOwnerMember!.id }],
		});
		expect((stillTarget as { role: string } | null)?.role).toBe("member");
	});
});
