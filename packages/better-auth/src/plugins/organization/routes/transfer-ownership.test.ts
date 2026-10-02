import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { createAuthMiddleware, getSessionFromCtx } from "../../../api";
import { parseSetCookieHeader } from "../../../cookies";
import { getTestInstance } from "../../../test-utils/test-instance";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

/**
 * @see https://github.com/better-auth/better-auth/issues/11529
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
	 * @see https://github.com/better-auth/better-auth/issues/11529
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

/**
 * @see https://github.com/better-auth/better-auth/issues/11529
 */
describe("transferOwnership confirmation hardening", () => {
	async function setup(
		ownershipTransfer: NonNullable<
			Parameters<typeof organization>[0]
		>["ownershipTransfer"],
		extra: { user?: Record<string, unknown> } = {},
	) {
		const capture = { token: "" };
		const instance = await getTestInstance({
			plugins: [
				organization({
					ownershipTransfer: {
						async sendTransferOwnershipVerification({ token }) {
							capture.token = token;
						},
						...ownershipTransfer,
					},
				}),
			],
			...extra,
		});
		const { headers } = await instance.signInWithTestUser();
		const org = await instance.auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await instance.auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await instance.auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		return {
			...instance,
			capture,
			headers,
			org: org!,
			newUser,
			newOwnerMember,
		};
	}

	it("explicit mode rejects a callbackURL that can't be a usable emailed link, leaving no token behind", async () => {
		const { auth, db, capture, headers, org, newOwnerMember } = await setup({
			confirmationMode: "explicit",
		});
		const { baseURL } = await auth.$context;
		const cases: Array<[string | undefined, string]> = [
			// the emailed link is the app's own URL, so there must be one
			[undefined, "CALLBACK_URL_REQUIRED"],
			// a mail client can't resolve a relative link
			["/org/settings", "INVALID_CALLBACK_URL"],
			// must not lead back to the instant GET callback, however it's written
			[
				`${baseURL}/organization/transfer-ownership/callback`,
				"INVALID_CALLBACK_URL",
			],
			[
				`${baseURL}/organization/transfer-ownership/callback/`,
				"INVALID_CALLBACK_URL",
			],
			[
				`${baseURL}/organization/transfer%2Downership/callback`,
				"INVALID_CALLBACK_URL",
			],
			[
				`${baseURL}/organization/foo/../transfer-ownership/callback?x=1#y`,
				"INVALID_CALLBACK_URL",
			],
			// the real token is appended, so one that's already there is rejected
			["https://app.example.com/org?token=stale", "INVALID_CALLBACK_URL"],
		];
		for (const [callbackURL, code] of cases) {
			await expect(
				auth.api.transferOwnership({
					body: {
						organizationId: org.id,
						newOwnerMemberId: newOwnerMember!.id,
						callbackURL,
					},
					headers,
				}),
				String(callbackURL),
			).rejects.toMatchObject({ body: { code } });
		}

		expect(capture.token).toBe("");
		const rows = await db.findMany({ model: "verification" });
		expect(
			rows.filter((row) =>
				(row as { identifier: string }).identifier.startsWith(
					"transfer-ownership-",
				),
			),
		).toHaveLength(0);
	});

	it("preview does not expose user fields marked returned: false", async () => {
		const { auth, db, capture, headers, org, newUser, newOwnerMember } =
			await setup(
				{ confirmationMode: "explicit" },
				{
					user: {
						additionalFields: {
							internalNote: {
								type: "string",
								required: false,
								returned: false,
							},
						},
					},
				},
			);
		await db.update({
			model: "user",
			update: { internalNote: "do-not-leak" },
			where: [{ field: "id", value: newUser.user.id }],
		});
		await auth.api.transferOwnership({
			body: {
				organizationId: org.id,
				newOwnerMemberId: newOwnerMember!.id,
				callbackURL: "https://app.example.com/org/settings",
			},
			headers,
		});

		const preview = await auth.api.transferOwnershipPreview({
			query: { token: capture.token },
			headers,
		});
		expect(preview.newOwner.user.email).toBe("new-owner@test.com");
		expect(JSON.stringify(preview)).not.toContain("do-not-leak");
		expect(JSON.stringify(preview)).not.toContain("internalNote");
	});

	it("only the current owner can use the token, and a rejected attempt does not burn it", async () => {
		const { auth, signInWithUser, capture, headers, org, newOwnerMember } =
			await setup({ confirmationMode: "explicit" });
		await auth.api.transferOwnership({
			body: {
				organizationId: org.id,
				newOwnerMemberId: newOwnerMember!.id,
				callbackURL: "https://app.example.com/org/settings",
			},
			headers,
		});

		// The nominated successor is signed in and holds the token, but is not
		// the member it was issued for.
		const successor = await signInWithUser("new-owner@test.com", "password");
		await expect(
			auth.api.transferOwnershipPreview({
				query: { token: capture.token },
				headers: successor.headers,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
		await expect(
			auth.api.transferOwnershipConfirm({
				body: { token: capture.token },
				headers: successor.headers,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });

		const confirmed = await auth.api.transferOwnershipConfirm({
			body: { token: capture.token },
			headers,
		});
		expect(confirmed.newOwner.role).toBe("owner");
	});

	it("an explicit-mode token can't be redeemed through the GET callback", async () => {
		const { auth, capture, headers, org, newOwnerMember } = await setup({
			confirmationMode: "explicit",
		});
		await auth.api.transferOwnership({
			body: {
				organizationId: org.id,
				newOwnerMemberId: newOwnerMember!.id,
				callbackURL: "https://app.example.com/org/settings",
			},
			headers,
		});

		// A trusted host that serves the same auth routes could be named in the
		// callbackURL, so the token itself has to say it needs a POST.
		await expect(
			auth.api.transferOwnershipCallback({
				query: { token: capture.token },
				headers,
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
		const stillOwner = await auth.api.getActiveMember({ headers });
		expect(stillOwner!.role).toBe("owner");

		// The rejected visit didn't burn it: the explicit confirm still works.
		const confirmed = await auth.api.transferOwnershipConfirm({
			body: { token: capture.token },
			headers,
		});
		expect(confirmed.newOwner.role).toBe("owner");
	});

	it("rejects an expired token without transferring anything", async () => {
		const { auth, capture, headers, org, newOwnerMember } = await setup({
			confirmationMode: "explicit",
			transferTokenExpiresIn: 1,
		});
		await auth.api.transferOwnership({
			body: {
				organizationId: org.id,
				newOwnerMemberId: newOwnerMember!.id,
				callbackURL: "https://app.example.com/org/settings",
			},
			headers,
		});

		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(Date.now() + 5_000);
			await expect(
				auth.api.transferOwnershipConfirm({
					body: { token: capture.token },
					headers,
				}),
			).rejects.toMatchObject({ body: { code: "INVALID_TOKEN" } });
		} finally {
			vi.useRealTimers();
		}
		const stillOwner = await auth.api.getActiveMember({ headers });
		expect(stillOwner!.role).toBe("owner");
	});
});

/**
 * An earlier hook can already have loaded the session from the cookie cache
 * into `ctx.context.session`; `getSessionFromCtx` returns that without
 * honoring `disableCookieCache`. The token endpoints must still re-read the
 * session store, so a revoked session that still carries a valid cached
 * cookie can't authorize a transfer.
 *
 * @see https://github.com/better-auth/better-auth/issues/11529
 */
describe("transferOwnership confirmation is revocation-aware with cookie cache", () => {
	const preloadCachedSessionPlugin = {
		id: "preload-cached-session",
		hooks: {
			before: [
				{
					matcher(ctx) {
						return (
							ctx.path?.startsWith("/organization/transfer-ownership/") === true
						);
					},
					handler: createAuthMiddleware(async (ctx) => {
						await getSessionFromCtx(ctx);
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;

	async function setup({ confirmation = true } = {}) {
		const capture = { token: "" };
		const instance = await getTestInstance({
			baseURL: "http://localhost:3000",
			plugins: [
				preloadCachedSessionPlugin,
				organization(
					confirmation
						? {
								ownershipTransfer: {
									confirmationMode: "explicit",
									async sendTransferOwnershipVerification({ token }) {
										capture.token = token;
									},
								},
							}
						: {},
				),
			],
			session: { cookieCache: { enabled: true, maxAge: 60 } },
		});
		const { headers } = await instance.signInWithTestUser();
		// Materialize the cookie cache: the signed `session_data` cookie comes
		// back on the get-session response and has to be sent along explicitly.
		const sessionRes = await instance.client.getSession({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const cached = parseSetCookieHeader(
						context.response.headers.get("set-cookie") ?? "",
					).get("better-auth.session_data")?.value;
					if (cached) {
						headers.set(
							"cookie",
							`${headers.get("cookie")}; better-auth.session_data=${cached}`,
						);
					}
				},
			},
		});
		const sessionToken = sessionRes.data?.session.token;
		const ownerUserId = sessionRes.data?.user.id;
		if (!sessionToken || !ownerUserId) throw new Error("expected a session");
		expect(headers.get("cookie")).toContain("better-auth.session_data=");

		const org = await instance.auth.api.createOrganization({
			body: { name: "Acme", slug: "acme" },
			headers,
		});
		const newUser = await instance.auth.api.signUpEmail({
			body: {
				email: "new-owner@test.com",
				name: "New Owner",
				password: "password",
			},
		});
		const newOwnerMember = await instance.auth.api.addMember({
			body: {
				organizationId: org!.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		if (confirmation) {
			await instance.auth.api.transferOwnership({
				body: {
					organizationId: org!.id,
					newOwnerMemberId: newOwnerMember!.id,
					callbackURL: "https://app.example.com/org/settings",
				},
				headers,
			});
			expect(capture.token.length).toBe(32);
		}
		// Revoke the backing session server-side; the signed session_data cookie
		// is still present in `headers`.
		await instance.db.delete({
			model: "session",
			where: [{ field: "token", value: sessionToken }],
		});
		return {
			...instance,
			capture,
			headers,
			org: org!,
			ownerUserId,
			newOwnerMember: newOwnerMember!,
		};
	}

	async function ownerRoles(
		db: Awaited<ReturnType<typeof setup>>["db"],
		organizationId: string,
	) {
		const members = await db.findMany({
			model: "member",
			where: [{ field: "organizationId", value: organizationId }],
		});
		return (members as Array<{ userId: string; role: string }>)
			.filter((member) => member.role.split(",").includes("owner"))
			.map((member) => member.userId);
	}

	it("rejects an immediate transfer from a revoked but cached session", async () => {
		const { auth, db, headers, org, ownerUserId, newOwnerMember } = await setup(
			{
				confirmation: false,
			},
		);
		await expect(
			auth.api.transferOwnership({
				body: {
					organizationId: org.id,
					newOwnerMemberId: newOwnerMember.id,
				},
				headers,
			}),
		).rejects.toThrow();
		expect(await ownerRoles(db, org.id)).toEqual([ownerUserId]);
	});

	it("rejects /organization/transfer-ownership/confirm from a revoked but cached session", async () => {
		const { auth, db, capture, headers, org, ownerUserId } = await setup();
		await expect(
			auth.api.transferOwnershipConfirm({
				body: { token: capture.token },
				headers,
			}),
		).rejects.toThrow();
		expect(await ownerRoles(db, org.id)).toEqual([ownerUserId]);
	});

	it("rejects /organization/transfer-ownership/preview from a revoked but cached session", async () => {
		const { auth, capture, headers } = await setup();
		await expect(
			auth.api.transferOwnershipPreview({
				query: { token: capture.token },
				headers,
			}),
		).rejects.toThrow();
	});

	it("rejects /organization/transfer-ownership/callback from a revoked but cached session", async () => {
		const { auth, db, capture, headers, org, ownerUserId } = await setup();
		await expect(
			auth.api.transferOwnershipCallback({
				query: { token: capture.token },
				headers,
			}),
		).rejects.toThrow();
		expect(await ownerRoles(db, org.id)).toEqual([ownerUserId]);
	});
});

/**
 * Two transfers that both start from the same owner snapshot: the second one
 * must not succeed once the first has demoted that owner, or the organization
 * is left with two owners.
 *
 * @see https://github.com/better-auth/better-auth/issues/11529
 */
describe("transferOwnership starting from a stale owner snapshot", () => {
	it("refuses to apply once a concurrent transfer has already demoted the owner", async () => {
		let nested = false;
		let transferToY: (() => Promise<unknown>) | undefined;
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						// Runs after the route has checked the owner but before the swap:
						// a second transfer completes in that gap, so the first one goes
						// on with an owner that no longer holds the creator role.
						async beforeTransferOwnership() {
							if (nested) return;
							nested = true;
							await transferToY?.();
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const ownerUserId = (await auth.api.getSession({ headers }))!.user.id;
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
		transferToY = () =>
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: memberY!.id },
				headers,
			});

		await expect(
			auth.api.transferOwnership({
				body: { organizationId: org!.id, newOwnerMemberId: memberX!.id },
				headers,
			}),
		).rejects.toThrow();

		const members = (await db.findMany({
			model: "member",
			where: [{ field: "organizationId", value: org!.id }],
		})) as Array<{ id: string; userId: string; role: string }>;
		const roleOf = (id: string) => members.find((m) => m.id === id)?.role;
		expect(members.filter((m) => m.role === "owner").map((m) => m.id)).toEqual([
			memberY!.id,
		]);
		expect(roleOf(memberX!.id)).toBe("member");
		expect(members.find((m) => m.userId === ownerUserId)?.role).toBe("member");
	});
});
