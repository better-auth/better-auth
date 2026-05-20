import { memoryAdapter } from "@better-auth/memory-adapter";
import type { BetterAuthPlugin } from "better-auth";
import { getTestInstance } from "better-auth/test";
import { describe, expect, vi } from "vitest";
import { organizationClient } from "../../client";
import { organization } from "../../organization";
import { getOrganizationData } from "../../test/utils";

/**
 * Helper to define `getTestInstance` as a shorter alias, specific to the organization plugin.
 * @internal
 */
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

describe("delete organization", async (it) => {
	const plugin = organization();
	const { auth, signInWithTestUser, adapter } = await defineInstance([plugin]);
	const { headers } = await signInWithTestUser();

	it("should delete an organization", async () => {
		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});

		expect(org).toBeDefined();

		await auth.api.deleteOrganization({
			headers,
			body: { organizationId: org.id },
		});

		const deletedOrg = await adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: org.id }],
		});

		expect(deletedOrg).toBeNull();
	});

	it("should prevent deleting an undefined organization", async () => {
		const { headers } = await signInWithTestUser();
		const randomOrgId = "123";

		await expect(async () => {
			await auth.api.deleteOrganization({
				headers,
				body: { organizationId: randomOrgId },
			});
		}).rejects.toThrow("Organization not found");
	});

	describe("should work with slug", async (it) => {
		const plugin = organization({ defaultOrganizationIdField: "slug" });
		const { auth, signInWithTestUser, adapter } = await defineInstance([
			plugin,
		]);
		const { headers } = await signInWithTestUser();

		it("should delete an organization with slug", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});

			await auth.api.deleteOrganization({
				headers,
				body: { organizationId: org.slug },
			});

			const deletedOrg = await adapter.findOne({
				model: "organization",
				where: [{ field: "slug", value: org.slug }],
			});

			expect(deletedOrg).toBeNull();
		});

		it("should not delete an org by it's id when using slug as the default organization id field", async () => {
			const orgData = getOrganizationData();
			const org = await auth.api.createOrganization({
				headers,
				body: {
					name: orgData.name,
					slug: orgData.slug,
				},
			});

			await expect(async () => {
				await auth.api.deleteOrganization({
					headers,
					body: { organizationId: org.id },
				});
			}).rejects.toThrow("Organization not found");
		});

		it("should prevent deleting an undefined organization", async () => {
			const { headers } = await signInWithTestUser();
			const randomOrgSlug = "org-slug-123";

			await expect(async () => {
				await auth.api.deleteOrganization({
					headers,
					body: { organizationId: randomOrgSlug },
				});
			}).rejects.toThrow("Organization not found");
		});
	});
});

describe("delete organization - cascade rollback", async (it) => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/9630
	 */
	it("rolls back when an intermediate step throws", async () => {
		const db: Record<string, any[]> = {
			users: [],
			session: [],
			account: [],
			verification: [],
			organization: [],
			member: [],
			invitation: [],
		};
		const { auth, signInWithTestUser } = await getTestInstance(
			{
				database: memoryAdapter(db, { debugLogs: false }),
				user: { modelName: "users" },
				plugins: [
					organization({
						async sendInvitationEmail() {},
					}),
				],
				logger: { level: "error" },
			},
			{
				clientOptions: {
					plugins: [organizationClient()],
				},
			},
		);
		const ctx = await auth.$context;
		const { headers } = await signInWithTestUser();

		const orgData = getOrganizationData();
		const org = await auth.api.createOrganization({
			headers,
			body: {
				name: orgData.name,
				slug: orgData.slug,
			},
		});
		const organizationId = org.id;

		const inviteRes = await auth.api.createInvitation({
			headers,
			body: {
				email: "invitee@email.com",
				role: "member",
				organizationId,
			},
		});
		expect(inviteRes).toBeDefined();

		const originalTransaction = ctx.adapter.transaction.bind(ctx.adapter);
		const spy = vi
			.spyOn(ctx.adapter, "transaction")
			.mockImplementation(async (cb: any) => {
				return originalTransaction(async (trx: any) => {
					const originalDeleteMany = trx.deleteMany.bind(trx);
					trx.deleteMany = async (args: any) => {
						if (args.model === "invitation") {
							throw new Error("simulated mid-cascade failure");
						}
						return originalDeleteMany(args);
					};
					return cb(trx);
				});
			});

		try {
			await expect(
				auth.api.deleteOrganization({
					headers,
					body: { organizationId },
				}),
			).rejects.toThrow();
		} finally {
			spy.mockRestore();
		}

		const memberCount = await ctx.adapter.count({
			model: "member",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(memberCount).toBeGreaterThan(0);

		const invitationCount = await ctx.adapter.count({
			model: "invitation",
			where: [{ field: "organizationId", value: organizationId }],
		});
		expect(invitationCount).toBeGreaterThan(0);

		const orgStillExists = await ctx.adapter.findOne({
			model: "organization",
			where: [{ field: "id", value: organizationId }],
		});
		expect(orgStillExists).not.toBeNull();
	});
});
