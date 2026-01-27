import { describe, expect, expectTypeOf } from "vitest";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { defineInstance, getOrganizationData } from "../../test/utils";

describe("add member", async (it) => {
	const plugin = organization({
		membershipLimit: 6,
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	// Create an organization for testing
	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should add member on the server directly", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `new-member-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "new member",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: session?.user.id!,
				role: "admin",
			},
		});
		expect(member?.role).toBe("admin");
	});

	it("should add member on the server with multiple roles", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `new-member-mr-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "new member mr",
			},
		});
		const session = await auth.api.getSession({
			headers: new Headers({
				Authorization: `Bearer ${newUser?.token}`,
			}),
		});

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: session?.user.id!,
				role: ["admin", "member"],
			},
		});
		expect(member?.role).toBe("admin,member");
	});

	it("should not add member when user is not found", async () => {
		await expect(
			auth.api.addMember({
				body: {
					organizationId: testOrg.id,
					userId: "non-existent-user-id",
					role: "member",
				},
			}),
		).rejects.toThrow("User not found");
	});

	it("should not add member when user is already a member", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `already-member-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "already member",
			},
		});

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		// Add member first time
		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// Try to add same member again
		await expect(
			auth.api.addMember({
				body: {
					organizationId: org?.id,
					userId: newUser.user.id,
					role: "admin",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION
				.message,
		);
	});

	it("should not add member when organization is not found", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `org-not-found-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "org not found user",
			},
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: "non-existent-org-id",
					userId: newUser.user.id,
					role: "member",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ORGANIZATION_NOT_FOUND.message);
	});
});

describe("add member - membership limit", async (it) => {
	const plugin = organization({
		membershipLimit: 3,
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should respect membershipLimit when adding members to organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
			headers,
		});

		// Create users and add them as members (owner is #1, so we can add 2 more)
		const user1 = await auth.api.signUpEmail({
			body: {
				email: `limit-user1-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "user 1",
			},
		});
		const user2 = await auth.api.signUpEmail({
			body: {
				email: `limit-user2-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "user 2",
			},
		});
		const user3 = await auth.api.signUpEmail({
			body: {
				email: `limit-user3-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "user 3",
			},
		});

		// Add member #2
		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: user1.user.id,
				role: "member",
			},
		});

		// Add member #3
		await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: user2.user.id,
				role: "member",
			},
		});

		// Try to add member #4 - should fail
		await expect(
			auth.api.addMember({
				body: {
					organizationId: org?.id,
					userId: user3.user.id,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED.message,
		);
	});
});

describe("add member - membership limit function", async (it) => {
	const plugin = organization({
		membershipLimit: (user, organization) => {
			// For organizations with "limited" in name, limit to 1 member
			if (organization.name.includes("limited")) {
				return 1;
			}
			return 100;
		},
		async sendInvitationEmail(data, request) {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should respect dynamic membershipLimit function when adding members", async () => {
		// Create org with "limited" in name (limit = 1, so only owner)
		const orgData = getOrganizationData({
			name: "limited-org-add-member-test",
			slug: `limited-org-add-member-test-${crypto.randomUUID()}`,
		});
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `limit-func-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Limited User",
			},
		});

		// Should fail because limit is 1 (only owner)
		await expect(
			auth.api.addMember({
				body: {
					organizationId: org?.id,
					userId: newUser.user.id,
					role: "member",
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED.message,
		);
	});

	it("should allow adding member when organization name does not trigger limit", async () => {
		// Create org without "limited" in name (limit = 100)
		const orgData = getOrganizationData({
			name: "normal-org-add-member-test",
			slug: `normal-org-add-member-test-${crypto.randomUUID()}`,
		});
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `normal-func-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Normal User",
			},
		});

		// Should succeed
		const member = await auth.api.addMember({
			body: {
				organizationId: org?.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		expect(member).not.toBeNull();
		expect(member?.organizationId).toBe(org.id);
		expect(member?.role).toBe("member");
	});
});

describe("add member - hooks", async (it) => {
	let hooksCalled: string[] = [];

	const plugin = organization({
		hooks: {
			beforeAddMember: async (data) => {
				hooksCalled.push("beforeAddMember");
			},
			afterAddMember: async (data) => {
				hooksCalled.push("afterAddMember");
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should call add member hooks", async () => {
		hooksCalled = [];

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `hooks-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hooks User",
			},
		});

		await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		expect(hooksCalled).toContain("beforeAddMember");
		expect(hooksCalled).toContain("afterAddMember");
	});

	it("should allow beforeAddMember hook to modify member data", async () => {
		let modifiedMemberData: any;

		const plugin = organization({
			hooks: {
				beforeAddMember: async (data) => {
					// Return modified role wrapped in data object
					return {
						data: {
							role: "admin,member",
						},
					};
				},
				afterAddMember: async (data) => {
					modifiedMemberData = data.member;
				},
			},
			async sendInvitationEmail() {},
		});
		const { auth, signInWithTestUser } = await defineInstance([plugin]);
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `hook-modify-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hook Modify User",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});

		// The role should be modified by the hook
		expect(member?.role).toBe("admin,member");
		expect(modifiedMemberData?.role).toBe("admin,member");
	});
});

describe("add member - additional fields", async (it) => {
	// Note: member additional fields should use defaultValue or be optional
	// because the owner member is created automatically when creating an org
	const plugin = organization({
		schema: {
			member: {
				additionalFields: {
					memberPublicField: {
						type: "string",
						required: false,
					},
					memberOptionalField: {
						type: "string",
						required: false,
					},
					memberHiddenField: {
						type: "string",
						required: false,
						returned: false,
					},
				},
			},
		},
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser, adapter } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const org = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should add member with additional fields", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `additional-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Additional Fields User",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
				memberPublicField: "hey",
				memberOptionalField: "hey2",
			},
		});

		if (!member) throw new Error("Member is null");
		expect(member?.memberPublicField).toBe("hey");
		expectTypeOf<typeof member.memberPublicField>().toEqualTypeOf<
			string | undefined
		>();
		expect(member?.memberOptionalField).toBe("hey2");
		expectTypeOf<typeof member.memberOptionalField>().toEqualTypeOf<
			string | undefined
		>();
		// Hidden field should not be returned
		expect(member?.memberHiddenField).toBeUndefined();
	});

	it("should store hidden field in database but not return it", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `hidden-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "Hidden Field User",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
				memberPublicField: "public",
				memberHiddenField: "secret",
			},
		});

		if (!member) throw new Error("Member is null");

		// Hidden field should not be returned
		expect(member?.memberHiddenField).toBeUndefined();

		// But it should be stored in the database
		const dbMember = await adapter.findOne<{
			id: string;
			memberHiddenField?: string;
		}>({
			model: "member",
			where: [{ field: "id", value: member.id }],
		});
		expect(dbMember?.memberHiddenField).toBe("secret");
	});
});
