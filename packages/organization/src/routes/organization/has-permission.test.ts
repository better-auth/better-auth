import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect } from "vitest";
import { organizationClient } from "../../client";
import { ORGANIZATION_ERROR_CODES } from "../../helpers/error-codes";
import { organization } from "../../organization";
import { getOrganizationData } from "../../test/utils";

async function defineInstance<Plugins extends BetterAuthPlugin[]>(
	plugins: Plugins,
) {
	const instance = await getTestInstance(
		{
			plugins: plugins,
			logger: {
				level: "error",
			},
		},
		{
			clientOptions: {
				plugins: [organizationClient()],
			},
		},
	);

	const adapter = (await instance.auth.$context).adapter;

	return { ...instance, adapter };
}

describe("has-permission endpoint", async (it) => {
	const plugin = organization({
		async sendInvitationEmail() {},
	});
	const { auth, signInWithTestUser, signInWithUser, adapter } =
		await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	const orgData = getOrganizationData();
	const testOrg = await auth.api.createOrganization({
		headers,
		body: {
			name: orgData.name,
			slug: orgData.slug,
		},
	});

	it("should return success true for owner with organization delete permission", async () => {
		const result = await auth.api.hasPermission({
			headers,
			body: {
				permissions: {
					organization: ["delete"],
				},
				organizationId: testOrg.id,
			},
		});

		expect(result.success).toBe(true);
		expect(result.error).toBeNull();
	});

	it("should return success true for owner with member permissions", async () => {
		const result = await auth.api.hasPermission({
			headers,
			body: {
				permissions: {
					member: ["create", "update", "delete"],
				},
				organizationId: testOrg.id,
			},
		});

		expect(result.success).toBe(true);
	});

	it("should return success false for member with organization delete permission", async () => {
		const memberEmail = `member-perm-${crypto.randomUUID()}@test.com`;
		const { user: memberUser } = (await auth.api.signUpEmail({
			body: {
				email: memberEmail,
				password: "test123456",
				name: "Member User",
			},
		})) as unknown as { user: { id: string } };

		await adapter.create({
			model: "member",
			data: {
				id: crypto.randomUUID(),
				organizationId: testOrg.id,
				userId: memberUser.id,
				role: "member",
				createdAt: new Date(),
			},
			forceAllowId: true,
		});

		const { headers: memberHeaders } = await signInWithUser(
			memberEmail,
			"test123456",
		);

		const result = await auth.api.hasPermission({
			headers: memberHeaders,
			body: {
				permissions: {
					organization: ["delete"],
				},
				organizationId: testOrg.id,
			},
		});

		expect(result.success).toBe(false);
	});

	it("should use active organization when organizationId not provided", async () => {
		await auth.api.setActiveOrganization({
			headers,
			body: {
				organizationId: testOrg.id,
			},
		});

		const result = await auth.api.hasPermission({
			headers,
			body: {
				permissions: {
					invitation: ["create"],
				},
			},
		});

		expect(result.success).toBe(true);
	});

	it("should throw error when no active organization and no organizationId", async () => {
		const newUserEmail = `no-org-perm-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: newUserEmail,
				password: "test123456",
				name: "No Org User",
			},
		});
		const { headers: newHeaders } = await signInWithUser(
			newUserEmail,
			"test123456",
		);

		await expect(
			auth.api.hasPermission({
				headers: newHeaders,
				body: {
					permissions: {
						member: ["create"],
					},
				},
			}),
		).rejects.toThrow(ORGANIZATION_ERROR_CODES.NO_ACTIVE_ORGANIZATION.message);
	});

	it("should throw error when user is not a member of the organization", async () => {
		const nonMemberEmail = `non-member-perm-${crypto.randomUUID()}@test.com`;
		await auth.api.signUpEmail({
			body: {
				email: nonMemberEmail,
				password: "test123456",
				name: "Non Member",
			},
		});
		const { headers: nonMemberHeaders } = await signInWithUser(
			nonMemberEmail,
			"test123456",
		);

		await expect(
			auth.api.hasPermission({
				headers: nonMemberHeaders,
				body: {
					permissions: {
						member: ["create"],
					},
					organizationId: testOrg.id,
				},
			}),
		).rejects.toThrow(
			ORGANIZATION_ERROR_CODES.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.message,
		);
	});
});
