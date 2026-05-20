import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { dynamicAccessControl } from "../addons/dynamic-access-control";
import { getRoleData } from "../addons/dynamic-access-control/tests/utils";
import { organizationClient } from "../client";
import { organization } from "../organization";
import { getOrganizationData } from "../test/utils";
import { ORGANIZATION_ERROR_CODES } from "./error-codes";

async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins,
			logger: { level: "error" },
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);
	return instance;
}

describe("role validation - static roles only (no dynamic AC)", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			async sendInvitationEmail() {},
		}),
	]);

	it("should accept default roles (owner, admin, member)", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `static-default-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "admin",
			},
		});
		expect(member.role).toBe("admin");
	});

	it("should accept member role", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `static-member-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		expect(member.role).toBe("member");
	});

	it("should reject unknown roles without dynamic AC addon", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `static-unknown-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: "custom-role-that-does-not-exist",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should reject multiple roles when one is unknown", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `static-multi-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: ["admin", "nonexistent"],
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should accept multiple valid default roles", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `static-multi-valid-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: ["admin", "member"],
			},
		});
		expect(member.role).toBe("admin,member");
	});
});

describe("role validation - custom static roles", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			roles: {
				sales: {
					authorize: () => ({ success: true as const }),
					statements: {},
				},
				support: {
					authorize: () => ({ success: true as const }),
					statements: {},
				},
			},
			async sendInvitationEmail() {},
		}),
	]);

	it("should accept custom static roles defined in options", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `custom-static-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "sales",
			},
		});
		expect(member.role).toBe("sales");
	});

	it("should reject roles not in defaults or custom static roles", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `custom-reject-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: "engineering",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should accept mix of default and custom static roles", async () => {
		const newUser = await auth.api.signUpEmail({
			body: {
				email: `custom-mix-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: ["admin", "sales"],
			},
		});
		expect(member.role).toBe("admin,sales");
	});
});

describe("role validation - with dynamic access control addon", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			use: [dynamicAccessControl()],
			async sendInvitationEmail() {},
		}),
	]);

	it("should accept dynamic roles that exist in the database", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org.id,
				role: "engineer",
			}),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-valid-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "engineer",
			},
		});
		expect(member.role).toBe("engineer");
	});

	it("should reject dynamic roles that do not exist in the database", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-invalid-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: "nonexistent-dynamic-role",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should accept mix of static and dynamic roles", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org.id,
				role: "devops",
			}),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-mix-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: ["admin", "devops"],
			},
		});
		expect(member.role).toBe("admin,devops");
	});

	it("should reject when some dynamic roles exist but others don't", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org.id,
				role: "qa",
			}),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-partial-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: ["qa", "ghost-role"],
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should not allow dynamic roles from a different organization", async () => {
		const { headers } = await signInWithTestUser();
		const org1 = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});
		const org2 = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org1.id,
				role: "org1-only-role",
			}),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-cross-org-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org2.id,
					userId: newUser.user.id,
					role: "org1-only-role",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should still accept default roles without DB lookup", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `dac-default-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		const member = await auth.api.addMember({
			body: {
				organizationId: org.id,
				userId: newUser.user.id,
				role: "member",
			},
		});
		expect(member.role).toBe("member");
	});
});

describe("role validation - via createInvitation", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			use: [dynamicAccessControl()],
			async sendInvitationEmail() {},
		}),
	]);

	it("should reject unknown roles in createInvitation", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					email: `invite-unknown-role-${crypto.randomUUID()}@email.com`,
					role: "nonexistent-role" as any,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should accept dynamic roles in createInvitation", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org.id,
				role: "reviewer",
			}),
		});

		const result = await auth.api.createInvitation({
			headers,
			body: {
				email: `invite-dynamic-${crypto.randomUUID()}@email.com`,
				role: "reviewer" as any,
				organizationId: org.id,
			},
		});

		expect(result.invitation.role).toBe("reviewer");
	});

	it("should accept default roles in createInvitation", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const result = await auth.api.createInvitation({
			headers,
			body: {
				email: `invite-default-${crypto.randomUUID()}@email.com`,
				role: "member",
				organizationId: org.id,
			},
		});

		expect(result.invitation.role).toBe("member");
	});
});

describe("role validation - via createInvitationURL", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			use: [dynamicAccessControl()],
			async sendInvitationEmail() {},
		}),
	]);

	it("should reject unknown roles in createInvitationURL", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.createInvitationURL({
				headers,
				body: {
					email: `url-unknown-${crypto.randomUUID()}@email.com`,
					role: "nonexistent-role" as any,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should accept dynamic roles in createInvitationURL", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await auth.api.createRole({
			headers,
			body: getRoleData({
				organizationId: org.id,
				role: "tester",
			}),
		});

		const result = await auth.api.createInvitationURL({
			headers,
			body: {
				email: `url-dynamic-${crypto.randomUUID()}@email.com`,
				role: "tester" as any,
				organizationId: org.id,
			},
		});

		expect(result.url).toBeDefined();
		expect(result.invitation.role).toBe("tester");
	});

	it("should accept default roles in createInvitationURL", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const result = await auth.api.createInvitationURL({
			headers,
			body: {
				email: `url-default-${crypto.randomUUID()}@email.com`,
				role: "admin",
				organizationId: org.id,
			},
		});

		expect(result.url).toBeDefined();
		expect(result.invitation.role).toBe("admin");
	});
});

describe("role validation - without dynamic AC rejects all unknown roles", async (it) => {
	const { auth, signInWithTestUser } = await defineInstance([
		organization({
			async sendInvitationEmail() {},
		}),
	]);

	it("should reject in addMember", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		const newUser = await auth.api.signUpEmail({
			body: {
				email: `no-dac-add-${crypto.randomUUID()}@email.com`,
				password: "password",
				name: "test user",
			},
		});

		await expect(
			auth.api.addMember({
				body: {
					organizationId: org.id,
					userId: newUser.user.id,
					role: "unknown",
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should reject in createInvitation", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.createInvitation({
				headers,
				body: {
					email: `no-dac-invite-${crypto.randomUUID()}@email.com`,
					role: "unknown" as any,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});

	it("should reject in createInvitationURL", async () => {
		const { headers } = await signInWithTestUser();
		const org = await auth.api.createOrganization({
			headers,
			body: getOrganizationData(),
		});

		await expect(
			auth.api.createInvitationURL({
				headers,
				body: {
					email: `no-dac-url-${crypto.randomUUID()}@email.com`,
					role: "unknown" as any,
					organizationId: org.id,
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.ROLE_NOT_FOUND.message);
	});
});
