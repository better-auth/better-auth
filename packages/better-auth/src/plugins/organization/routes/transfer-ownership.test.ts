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

	it("rejects transferring ownership when the caller is not the owner", async () => {
		const { auth, signInWithTestUser, signInWithUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers: ownerHeaders,
		});

		// A plain "member" has neither the creator role nor member:update.
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

	/**
	 * The default `admin` role holds `member:update`, the same permission
	 * `update-member-role` normally treats as sufficient for touching another
	 * member's role. But `update-member-role` still requires the actual
	 * creator role to *set or take the creator role itself*. This endpoint
	 * must enforce the same rule: a non-owner admin has no business minting a
	 * second owner while leaving the real owner untouched and their own role
	 * unchanged.
	 */
	it("rejects transferring ownership initiated by a non-owner admin, even though admin has member:update", async () => {
		const { auth, db, signInWithTestUser, signInWithUser } =
			await getTestInstance({
				plugins: [organization()],
			});
		const { headers: ownerHeaders } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers: ownerHeaders,
		});
		const owner = await auth.api.getActiveMember({ headers: ownerHeaders });

		const adminUser = await auth.api.signUpEmail({
			body: { email: "admin@test.com", name: "Admin", password: "password" },
		});
		const adminMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: adminUser.user.id,
				role: "admin",
			},
		});
		const { headers: adminHeaders } = await signInWithUser(
			"admin@test.com",
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
				headers: adminHeaders,
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES
				.YOU_ARE_NOT_ALLOWED_TO_TRANSFER_OWNERSHIP_OF_THIS_ORGANIZATION.message,
		);

		// Nothing must have changed: the real owner is still the owner, the
		// admin is still just an admin, and the target was never promoted.
		const ownerRow = await db.findOne({
			model: "member",
			where: [{ field: "id", value: owner!.id }],
		});
		expect((ownerRow as { role: string } | null)?.role).toBe("owner");
		const adminRow = await db.findOne({
			model: "member",
			where: [{ field: "id", value: adminMember!.id }],
		});
		expect((adminRow as { role: string } | null)?.role).toBe("admin");
		const targetRow = await db.findOne({
			model: "member",
			where: [{ field: "id", value: targetMember!.id }],
		});
		expect((targetRow as { role: string } | null)?.role).toBe("member");
	});

	/**
	 * The token must never be burned by a request that can't complete the
	 * transfer -- otherwise an email scanner following the callback link
	 * with no session (or a session for the wrong user) would permanently
	 * invalidate it before the real owner ever gets to click it.
	 */
	it("does not consume the token when the callback is visited with no session", async () => {
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

		// Visited with no session at all -- must fail without burning the token.
		await expect(
			auth.api.transferOwnershipCallback({ query: { token: capturedToken } }),
		).rejects.toThrow();

		const remaining = await db.findMany({
			model: "verification",
			where: [
				{ field: "identifier", value: `transfer-ownership-${capturedToken}` },
			],
		});
		expect(remaining.length).toBe(1);

		// The legitimate owner can still use it afterwards.
		const result = await auth.api.transferOwnershipCallback({
			query: { token: capturedToken },
			headers,
		});
		expect(result.newOwner.role).toBe("owner");
	});

	/**
	 * Two transfers from the same owner to two different targets, completed
	 * concurrently, must not both apply -- otherwise the organization ends up
	 * with two owners from a single owner's (possibly accidental) double
	 * request.
	 */
	it("applies at most one of two concurrent transfers from the same owner to different targets", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const userX = await auth.api.signUpEmail({
			body: { email: "x@test.com", name: "X", password: "password" },
		});
		const memberX = await auth.api.addMember({
			body: { organizationId: org!.id, userId: userX.user.id, role: "member" },
		});
		const userY = await auth.api.signUpEmail({
			body: { email: "y@test.com", name: "Y", password: "password" },
		});
		const memberY = await auth.api.addMember({
			body: { organizationId: org!.id, userId: userY.user.id, role: "member" },
		});

		const [toX, toY] = await Promise.allSettled([
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: memberX!.id },
				headers,
			}),
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: memberY!.id },
				headers,
			}),
		]);
		const successes = [toX, toY].filter((r) => r.status === "fulfilled");
		expect(successes.length).toBe(1);

		const membersRes = await auth.api.listMembers({
			query: { organizationId: org!.id },
			headers,
		});
		const owners = membersRes.members.filter((m) => m.role === "owner");
		expect(owners.length).toBe(1);

		// The loser's promotion must have been rolled back, not left in place
		// alongside the winner's -- otherwise this would show two owners
		// above instead of failing the assertion just made.
		const loserResult = toX.status === "fulfilled" ? toY : toX;
		expect(loserResult.status).toBe("rejected");
		const loserTarget = membersRes.members.find(
			(m) => m.id === (toX.status === "fulfilled" ? memberY!.id : memberX!.id),
		);
		expect(loserTarget?.role).toBe("member");
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10748
	 */
	it("preserves the target's other roles instead of overwriting them with just the creator role", async () => {
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [organization()],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "admin-target@test.com",
				name: "Admin Target",
				password: "password",
			},
		});
		const targetMember = await auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "admin",
			},
		});

		const result = await auth.api.transferOwnership({
			body: { organizationId: org!.id, newOwnerMemberId: targetMember!.id },
			headers,
		});
		if (!("newOwner" in result)) throw new Error("expected an immediate swap");
		expect(result.newOwner.role.split(",").sort()).toEqual(
			["admin", "owner"].sort(),
		);

		const targetRow = await db.findOne({
			model: "member",
			where: [{ field: "id", value: targetMember!.id }],
		});
		expect(
			(targetRow as { role: string } | null)?.role.split(",").sort(),
		).toEqual(["admin", "owner"].sort());
	});
});
