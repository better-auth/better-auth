import { describe, expect, it } from "vitest";
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
});
