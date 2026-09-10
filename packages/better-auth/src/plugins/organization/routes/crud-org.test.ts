import { describe, expect, it, vi } from "vitest";
import { createAuthClient } from "../../../client";
import { getTestInstance } from "../../../test-utils/test-instance";
import { organizationClient } from "../client";
import { ORGANIZATION_ERROR_CODES } from "../error-codes";
import { organization } from "../organization";

describe("get-full-organization", async () => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		plugins: [organization()],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});
	const org = await client.organization.create({
		name: "test",
		slug: "test",
		metadata: {
			test: "test",
		},
		fetchOptions: {
			headers,
		},
	});
	const secondOrg = await client.organization.create({
		name: "test-second",
		slug: "test-second",
		metadata: {
			test: "second-org",
		},
		fetchOptions: {
			headers,
		},
	});

	it("should get organization by organizationId", async () => {
		const { headers } = await signInWithTestUser();

		//set the second org as active
		await client.organization.setActive({
			organizationId: secondOrg.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const orgById = await client.organization.getFullOrganization({
			query: {
				// get the first org
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(orgById.data?.name).toBe("test");
	});

	it("should get organization by organizationSlug", async () => {
		const { headers } = await signInWithTestUser();
		const orgBySlug = await client.organization.getFullOrganization({
			query: {
				organizationSlug: "test",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(orgBySlug.data?.name).toBe("test");
	});

	it("should return null when no active organization and no query params", async () => {
		await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});
		const result = await client.organization.getFullOrganization({
			fetchOptions: {
				headers: headers,
			},
		});
		expect(result.data).toBeNull();
		expect(result.error).toBeNull();
	});

	it("should throw FORBIDDEN when user is not a member of the organization", async () => {
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "test3@test.com",
				password: "password",
				name: "test3",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(result.error?.status).toBe(403);
		expect(result.error?.code).toContain(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.code,
		);
	});

	it("should throw BAD_REQUEST when organization doesn't exist", async () => {
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: "non-existent-org-id",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.error?.status).toBe(400);
		expect(result.error?.code).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND.code,
		);
	});

	it("should include invitations in the response", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});

		// Create an invitation
		await client.organization.inviteMember({
			email: "invited@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});

		const fullOrg = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		expect(fullOrg.data?.invitations).toBeDefined();
		expect(Array.isArray(fullOrg.data?.invitations)).toBe(true);
		const invitation = fullOrg.data?.invitations.find(
			(inv: any) => inv.email === "invited@test.com",
		);
		expect(invitation).toBeDefined();
		expect(invitation?.role).toBe("member");
	});

	it("should prioritize organizationSlug over organizationId when both are provided", async () => {
		const result = await client.organization.getFullOrganization({
			query: {
				organizationId: org.data?.id as string,
				organizationSlug: secondOrg.data?.slug as string,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.data).toBeTruthy();
		expect(result.data?.name).toBe(secondOrg.data?.name);
	});

	it("should allow listing members with membersLimit", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const newUser = await auth.api.signUpEmail({
			body: {
				email: "test2@test.com",
				password: "password",
				name: "test2",
			},
		});
		await auth.api.addMember({
			body: {
				userId: newUser.user.id,
				role: "member",
				organizationId: org.data?.id as string,
			},
		});
		const FullOrganization = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});
		expect(FullOrganization.data?.members.length).toBe(2);

		const limitedMembers = await client.organization.getFullOrganization({
			query: {
				membersLimit: 1,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(limitedMembers.data?.members.length).toBe(1);
	});

	it("should use default membershipLimit when no membersLimit is specified", async () => {
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		for (let i = 3; i <= 5; i++) {
			const newUser = await auth.api.signUpEmail({
				body: {
					email: `test-${i}@test.com`,
					password: "password",
					name: `test${i}`,
				},
			});
			await auth.api.addMember({
				body: {
					userId: newUser.user.id,
					role: "member",
					organizationId: org.data?.id as string,
				},
			});
		}

		const fullOrg = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		expect(fullOrg.data?.members.length).toBeGreaterThan(3);
		expect(fullOrg.data?.members.length).toBeLessThanOrEqual(6);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10243
 */
describe("get-organization", async () => {
	const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
		plugins: [organization()],
	});
	const { headers } = await signInWithTestUser();
	const client = createAuthClient({
		plugins: [organizationClient()],
		baseURL: "http://localhost:3000/api/auth",
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				return auth.handler(new Request(url, init));
			},
		},
	});
	const org = await client.organization.create({
		name: "meta-org",
		slug: "meta-org",
		metadata: {
			plan: "pro",
		},
		fetchOptions: {
			headers,
		},
	});
	const secondOrg = await client.organization.create({
		name: "meta-org-second",
		slug: "meta-org-second",
		metadata: {
			plan: "free",
		},
		fetchOptions: {
			headers,
		},
	});

	it("should get organization metadata by organizationId", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId: secondOrg.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const result = await client.organization.getOrganization({
			query: {
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.data?.id).toBe(org.data?.id);
		expect(result.data?.name).toBe("meta-org");
		expect(result.data?.slug).toBe("meta-org");
		expect(result.data).not.toHaveProperty("members");
		expect(result.data).not.toHaveProperty("invitations");
		expect(result.data).not.toHaveProperty("teams");
	});

	it("should get organization metadata by organizationSlug", async () => {
		const { headers } = await signInWithTestUser();
		const result = await client.organization.getOrganization({
			query: {
				organizationSlug: "meta-org",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.data?.name).toBe("meta-org");
		expect(result.data?.slug).toBe("meta-org");
		expect(result.data).not.toHaveProperty("members");
		expect(result.data).not.toHaveProperty("invitations");
	});

	it("should fall back to the active organization", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId: secondOrg.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		const result = await client.organization.getOrganization({
			fetchOptions: {
				headers,
			},
		});
		expect(result.data?.id).toBe(secondOrg.data?.id);
		expect(result.data?.name).toBe("meta-org-second");
		expect(result.data).not.toHaveProperty("members");
	});

	it("should return null when no active organization and no query params", async () => {
		await client.organization.setActive({
			organizationId: null,
			fetchOptions: {
				headers,
			},
		});
		const result = await client.organization.getOrganization({
			fetchOptions: {
				headers,
			},
		});
		expect(result.data).toBeNull();
		expect(result.error).toBeNull();
	});

	it("should throw FORBIDDEN when user is not a member of the organization", async () => {
		const newHeaders = new Headers();
		await client.signUp.email(
			{
				email: "get-org-outsider@test.com",
				password: "password",
				name: "outsider",
			},
			{
				onSuccess: cookieSetter(newHeaders),
			},
		);
		const result = await client.organization.getOrganization({
			query: {
				organizationId: org.data?.id as string,
			},
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(result.error?.status).toBe(403);
		expect(result.error?.code).toContain(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.code,
		);
	});

	it("should throw BAD_REQUEST when organization doesn't exist", async () => {
		const result = await client.organization.getOrganization({
			query: {
				organizationId: "non-existent-org-id",
			},
			fetchOptions: {
				headers,
			},
		});
		expect(result.error?.status).toBe(400);
		expect(result.error?.code).toContain(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND.code,
		);
	});

	it("should not include members or invitations unlike getFullOrganization", async () => {
		const { headers } = await signInWithTestUser();
		await client.organization.setActive({
			organizationId: org.data?.id as string,
			fetchOptions: {
				headers,
			},
		});
		await client.organization.inviteMember({
			email: "get-org-invited@test.com",
			role: "member",
			fetchOptions: {
				headers,
			},
		});

		const metadataOnly = await client.organization.getOrganization({
			fetchOptions: {
				headers,
			},
		});
		const fullOrg = await client.organization.getFullOrganization({
			fetchOptions: {
				headers,
			},
		});

		expect(metadataOnly.data).not.toHaveProperty("members");
		expect(metadataOnly.data).not.toHaveProperty("invitations");
		expect(fullOrg.data?.members).toBeDefined();
		expect(Array.isArray(fullOrg.data?.members)).toBe(true);
		expect(fullOrg.data?.invitations).toBeDefined();
		expect(Array.isArray(fullOrg.data?.invitations)).toBe(true);
		expect(metadataOnly.data?.id).toBe(fullOrg.data?.id);
		expect(metadataOnly.data?.name).toBe(fullOrg.data?.name);
	});
});

describe("organization hooks", async () => {
	it("should apply beforeCreateOrganization hook", async () => {
		const beforeCreateOrganization = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					organization({
						organizationHooks: {
							beforeCreateOrganization: async (data) => {
								beforeCreateOrganization();
								return {
									data: {
										...data.organization,
										metadata: {
											hookCalled: true,
										},
										name: "changed-name",
									},
								};
							},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [organizationClient()],
				},
			},
		);
		const { headers } = await signInWithTestUser();
		const result = await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(beforeCreateOrganization).toHaveBeenCalled();
		expect(result?.name).toBe("changed-name");
		expect(result?.metadata).toEqual({
			hookCalled: true,
		});
	});

	it("should apply afterCreateOrganization hook", async () => {
		const afterCreateOrganization = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						afterCreateOrganization: async (data) => {
							afterCreateOrganization();
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(afterCreateOrganization).toHaveBeenCalled();
	});

	it("should apply beforeAddMember hook", async () => {
		const beforeAddMember = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeAddMember: async (data) => {
							beforeAddMember();
							return {
								data: {
									role: "changed-role",
								},
							};
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(beforeAddMember).toHaveBeenCalled();
		const member = await auth.api.getActiveMember({
			headers,
		});
		expect(member?.role).toBe("changed-role");
	});

	it("should apply afterAddMember hook", async () => {
		const afterAddMember = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						afterAddMember: async (data) => {
							afterAddMember();
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(afterAddMember).toHaveBeenCalled();
	});

	it("should apply beforeCreateTeam hook", async () => {
		const beforeCreateTeam = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					teams: {
						enabled: true,
					},
					organizationHooks: {
						beforeCreateTeam: async (data) => {
							beforeCreateTeam();
							return {
								data: {
									name: "changed-name",
								},
							};
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const result = await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(beforeCreateTeam).toHaveBeenCalled();
		const team = await auth.api.listOrganizationTeams({
			headers,
			query: {
				organizationId: result?.id,
			},
		});
		expect(team[0]?.name).toBe("changed-name");
	});

	it("should apply afterCreateTeam hook", async () => {
		const afterCreateTeam = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					teams: {
						enabled: true,
					},
					organizationHooks: {
						afterCreateTeam: async (data) => {
							afterCreateTeam();
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		expect(afterCreateTeam).toHaveBeenCalled();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9288
	 */
	it("should allow passing id through `beforeCreateTeam`", async () => {
		const customTeamId = "custom-team-id";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					teams: {
						enabled: true,
					},
					organizationHooks: {
						beforeCreateTeam: async () => {
							return {
								data: {
									id: customTeamId,
								},
							};
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const result = await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		const teams = await auth.api.listOrganizationTeams({
			headers,
			query: {
				organizationId: result?.id,
			},
		});
		expect(teams[0]?.id).toBe(customTeamId);
	});

	it("should allow passing id through `beforeCreateInvitation`", async () => {
		const customInvitationId = "custom-invitation-id";
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationHooks: {
						beforeCreateInvitation: async () => {
							return {
								data: {
									id: customInvitationId,
								},
							};
						},
					},
					async sendInvitationEmail() {},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: {
				name: "test",
				slug: "test",
			},
			headers,
		});
		const invitation = await auth.api.createInvitation({
			body: {
				email: "invited@test.com",
				role: "member",
				organizationId: org?.id,
			},
			headers,
		});
		expect(invitation?.id).toBe(customInvitationId);
	});

	it("should allow internal organization creation when disabled for users", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				organization({
					allowUserToCreateOrganization: false,
				}),
			],
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: "internal@test.com",
				password: "password",
				name: "Internal User",
			},
		});

		const internalOrg = await auth.api.createOrganization({
			body: {
				name: "Internal Org",
				slug: "internal-org",
				userId: newUser.user.id,
			},
		});
		expect(internalOrg).toBeDefined();
		expect(internalOrg?.name).toBe("Internal Org");
	});
});

describe("updateOrganization", async () => {
	const { auth, signInWithTestUser } = await getTestInstance({
		plugins: [organization()],
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9829
	 */
	it("should clear the logo when passing null", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: {
				name: "Logo Org",
				slug: "logo-org",
				logo: "https://example.com/logo.png",
			},
			headers,
		});
		expect(org?.logo).toBe("https://example.com/logo.png");

		const updated = await auth.api.updateOrganization({
			body: {
				organizationId: org!.id,
				data: {
					logo: null,
				},
			},
			headers,
		});
		expect(updated?.logo).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9829
	 */
	it("should accept a null logo on create", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: {
				name: "Null Logo Org",
				slug: "null-logo-org",
				logo: null,
			},
			headers,
		});
		expect(org?.logo).toBeNull();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10748
 */
describe("deleteOrganization confirmation", () => {
	it("instant mode: sends a verification email and only deletes after the callback token is consumed", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						async sendDeleteOrganizationVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Delete Me", slug: "delete-me" },
			headers,
		});

		const requestRes = await auth.api.deleteOrganization({
			body: { organizationId: org!.id },
			headers,
		});
		expect(requestRes).toMatchObject({
			success: true,
			message: "Verification email sent",
		});
		expect(capturedToken.length).toBe(32);

		// Not deleted yet.
		const stillThere = await auth.api.getFullOrganization({
			query: { organizationId: org!.id },
			headers,
		});
		expect(stillThere?.id).toBe(org!.id);

		const callbackRes = await auth.api.deleteOrganizationCallback({
			query: { token: capturedToken },
			headers,
		});
		expect(callbackRes?.id).toBe(org!.id);

		const afterDelete = await db.findOne({
			model: "organization",
			where: [{ field: "id", value: org!.id }],
		});
		expect(afterDelete).toBeNull();
	});

	it("explicit mode: preview doesn't delete, confirm applies it", async () => {
		let capturedUrl = "";
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						confirmationMode: "explicit",
						async sendDeleteOrganizationVerification({ url, token }) {
							capturedUrl = url;
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Delete Me Explicitly", slug: "delete-me-explicitly" },
			headers,
		});

		await auth.api.deleteOrganization({
			body: {
				organizationId: org!.id,
				callbackURL: "https://app.example.com/orgs",
			},
			headers,
		});

		// The emailed link is app-owned, not better-auth's own GET callback.
		expect(capturedUrl.startsWith("https://app.example.com/orgs")).toBe(true);
		expect(capturedUrl).not.toContain("/organization/delete/callback");

		const preview = await auth.api.deleteOrganizationPreview({
			query: { token: capturedToken },
			headers,
		});
		expect(preview.organization?.id).toBe(org!.id);

		const stillThere = await auth.api.getFullOrganization({
			query: { organizationId: org!.id },
			headers,
		});
		expect(stillThere?.id).toBe(org!.id);

		const confirmed = await auth.api.deleteOrganizationConfirm({
			body: { token: capturedToken },
			headers,
		});
		expect(confirmed?.id).toBe(org!.id);

		const afterDelete = await db.findOne({
			model: "organization",
			where: [{ field: "id", value: org!.id }],
		});
		expect(afterDelete).toBeNull();
	});

	it("rejects the callback once the caller's delete permission has been revoked", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						async sendDeleteOrganizationVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Revoked", slug: "revoked" },
			headers,
		});
		await auth.api.deleteOrganization({
			body: { organizationId: org!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		// Demote the requester below the delete permission after the email was
		// sent but before the link is clicked.
		const session = await auth.api.getSession({ headers });
		await db.update({
			model: "member",
			update: { role: "member" },
			where: [
				{ field: "organizationId", value: org!.id },
				{ field: "userId", value: session!.user.id },
			],
		});

		const callback = auth.api.deleteOrganizationCallback({
			query: { token: capturedToken },
			headers,
		});
		await expect(callback).rejects.toThrow();

		const stillThere = await auth.api.getFullOrganization({
			query: { organizationId: org!.id },
			headers,
		});
		expect(stillThere?.id).toBe(org!.id);

		// A failed authorization check must not have burned the token either.
		const remaining = await db.findMany({
			model: "verification",
			where: [
				{ field: "identifier", value: `delete-organization-${capturedToken}` },
			],
		});
		expect(remaining.length).toBe(1);
	});

	/**
	 * The token must never be burned by a request that can't complete the
	 * deletion -- otherwise an email scanner following the callback link
	 * with no session would permanently invalidate it before the real user
	 * ever gets to click it.
	 */
	it("does not consume the token when the callback is visited with no session", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						async sendDeleteOrganizationVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "No Session", slug: "no-session" },
			headers,
		});
		await auth.api.deleteOrganization({
			body: { organizationId: org!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		// Visited with no session at all -- must fail without burning the token.
		await expect(
			auth.api.deleteOrganizationCallback({ query: { token: capturedToken } }),
		).rejects.toThrow();

		const remaining = await db.findMany({
			model: "verification",
			where: [
				{ field: "identifier", value: `delete-organization-${capturedToken}` },
			],
		});
		expect(remaining.length).toBe(1);

		// The legitimate user can still use it afterwards.
		const callbackRes = await auth.api.deleteOrganizationCallback({
			query: { token: capturedToken },
			headers,
		});
		expect(callbackRes?.id).toBe(org!.id);
	});

	it("a delete token for one organization cannot delete another", async () => {
		let capturedToken = "";
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						async sendDeleteOrganizationVerification({ token }) {
							capturedToken = token;
						},
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const orgToDelete = await auth.api.createOrganization({
			body: { name: "Delete Me", slug: "delete-me-scope" },
			headers,
		});
		const otherOrg = await auth.api.createOrganization({
			body: { name: "Untouchable", slug: "untouchable" },
			headers,
		});

		await auth.api.deleteOrganization({
			body: { organizationId: orgToDelete!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		// The token is scoped to `orgToDelete`; it must not also delete
		// `otherOrg`, even though the same session created both.
		await auth.api.deleteOrganizationCallback({
			query: { token: capturedToken },
			headers,
		});

		const deleted = await db.findOne({
			model: "organization",
			where: [{ field: "id", value: orgToDelete!.id }],
		});
		expect(deleted).toBeNull();
		const untouched = await db.findOne({
			model: "organization",
			where: [{ field: "id", value: otherOrg!.id }],
		});
		expect(untouched).not.toBeNull();
	});

	// The delete token is single-use: two concurrent callbacks with the same
	// token must delete the organization exactly once. Whichever request
	// consumes the verification row first wins; the loser sees an invalid
	// token, and the destructive hooks must each fire only once.
	it("deletes only once when the same token is used concurrently", async () => {
		let capturedToken = "";
		const beforeDeleteOrganization = vi.fn(async () => {
			// Widen the race so both requests pass the token lookup before
			// either one finishes the destructive work.
			await new Promise((resolve) => setTimeout(resolve, 50));
		});
		const afterDeleteOrganization = vi.fn(async () => {});
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [
				organization({
					organizationDeletion: {
						async sendDeleteOrganizationVerification({ token }) {
							capturedToken = token;
						},
					},
					organizationHooks: {
						beforeDeleteOrganization,
						afterDeleteOrganization,
					},
				}),
			],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Race Me", slug: "race-me" },
			headers,
		});
		await auth.api.deleteOrganization({
			body: { organizationId: org!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		const [first, second] = await Promise.allSettled([
			auth.api.deleteOrganizationCallback({
				query: { token: capturedToken },
				headers,
			}),
			auth.api.deleteOrganizationCallback({
				query: { token: capturedToken },
				headers,
			}),
		]);
		const successes = [first, second].filter((r) => r.status === "fulfilled");
		const failures = [first, second].filter((r) => r.status === "rejected");
		expect(successes.length).toBe(1);
		expect(failures.length).toBe(1);

		expect(beforeDeleteOrganization).toHaveBeenCalledTimes(1);
		expect(afterDeleteOrganization).toHaveBeenCalledTimes(1);

		const remaining = await db.findMany({
			model: "verification",
			where: [
				{ field: "identifier", value: `delete-organization-${capturedToken}` },
			],
		});
		expect(remaining.length).toBe(0);
	});

	/**
	 * `disableOrganizationDeletion` may be turned on after a confirmation
	 * email was already sent -- an admin reacting to abuse, for instance.
	 * A still-unexpired token must not be able to delete the organization
	 * anyway once deletion has been disabled.
	 *
	 * @see https://github.com/better-auth/better-auth/issues/10748
	 */
	it("rejects the callback, preview, and confirm once deletion is disabled after the token was issued", async () => {
		let capturedToken = "";
		// Held onto directly so it can be mutated below: `organization()` keeps
		// this exact object as `ctx.context.orgOptions`, so flipping the flag
		// on it after the instance is created is equivalent to a config
		// change taking effect on the next request, with no server restart.
		const orgOptions: Parameters<typeof organization>[0] = {
			organizationDeletion: {
				confirmationMode: "explicit",
				async sendDeleteOrganizationVerification({ token }) {
					capturedToken = token;
				},
			},
		};
		const { auth, db, signInWithTestUser } = await getTestInstance({
			plugins: [organization(orgOptions)],
		});
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			body: { name: "Disable Me", slug: "disable-me" },
			headers,
		});
		await auth.api.deleteOrganization({
			body: { organizationId: org!.id },
			headers,
		});
		expect(capturedToken.length).toBe(32);

		// Disabled after the email was already sent.
		orgOptions.disableOrganizationDeletion = true;

		await expect(
			auth.api.deleteOrganizationPreview({
				query: { token: capturedToken },
				headers,
			}),
		).rejects.toThrow();
		await expect(
			auth.api.deleteOrganizationConfirm({
				body: { token: capturedToken },
				headers,
			}),
		).rejects.toThrow();
		await expect(
			auth.api.deleteOrganizationCallback({
				query: { token: capturedToken },
				headers,
			}),
		).rejects.toThrow();

		const stillThere = await db.findOne({
			model: "organization",
			where: [{ field: "id", value: org!.id }],
		});
		expect(stillThere).not.toBeNull();
	});
});
