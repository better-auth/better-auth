import type { GenericEndpointContext } from "@better-auth/core";
import { runWithRequestState } from "@better-auth/core/context";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { createAccessControl } from "../access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "./access";
import { hasPermission } from "./has-permission";
import { hasPermissionFn } from "./permission";
import { organization } from "./organization";
import type { OrganizationRole } from "./schema";
import type { OrganizationOptions } from "./types";

/**
 * The `useMemoryCache` role cache used to be a process-global `Map` keyed by
 * organization id that was written on every call and never evicted, so it
 * grew without bound and served stale roles across requests.
 */
describe("hasPermission role cache", () => {
	const ac = createAccessControl({
		project: ["create", "read", "update", "delete"],
		...defaultStatements,
	});
	const roles = {
		owner: ac.newRole({
			project: ["create", "read", "update", "delete"],
			...ownerAc.statements,
		}),
		admin: ac.newRole({
			project: ["create", "read"],
			...adminAc.statements,
		}),
		member: ac.newRole({
			project: ["read"],
			...memberAc.statements,
		}),
	};
	const options = {
		ac,
		roles,
		dynamicAccessControl: { enabled: true },
	} satisfies OrganizationOptions;

	async function setup() {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [organization(options)],
		});
		const context = await auth.$context;
		const ctx = { context } as unknown as GenericEndpointContext;
		const { headers } = await signInWithTestUser();

		async function createOrgWithRole(permission: Record<string, string[]>) {
			const slug = crypto.randomUUID();
			const org = await auth.api.createOrganization({
				body: {
					name: slug,
					slug,
				},
				headers,
			});
			if (!org) throw new Error("Organization not created");
			const organizationId = org.id;
			const role = await context.adapter.create<
				Omit<OrganizationRole, "permission"> & { permission: string }
			>({
				model: "organizationRole",
				data: {
					organizationId,
					role: "editor",
					permission: JSON.stringify(permission),
					createdAt: new Date(),
				},
			});
			return { organizationId, roleId: role.id };
		}

		const check = (
			organizationId: string,
			action: "read" | "update",
			useMemoryCache: boolean,
		) =>
			hasPermission(
				{
					organizationId,
					role: "editor",
					permissions: { project: [action] },
					options,
					useMemoryCache,
				},
				ctx,
			);

		return {
			context,
			ctx,
			createOrgWithRole,
			check,
		};
	}

	it("loads dynamic roles on the first cached call within a request", async () => {
		const { createOrgWithRole, check } = await setup();
		const { organizationId } = await createOrgWithRole({
			project: ["update"],
		});

		await runWithRequestState(new WeakMap(), async () => {
			expect(await check(organizationId, "update", true)).toBe(true);
		});
	});

	it("reuses resolved roles within the same request", async () => {
		const { context, createOrgWithRole, check } = await setup();
		const { organizationId, roleId } = await createOrgWithRole({
			project: ["read", "update"],
		});

		await runWithRequestState(new WeakMap(), async () => {
			expect(await check(organizationId, "update", true)).toBe(true);

			await context.adapter.update({
				model: "organizationRole",
				where: [{ field: "id", value: roleId }],
				update: {
					permission: JSON.stringify({
						project: ["read"],
					}),
				},
			});

			expect(await check(organizationId, "update", true)).toBe(true);
			expect(await check(organizationId, "read", true)).toBe(true);
		});
	});

	it("isolates adapters even when auth instances share the same options", async () => {
		const { createOrgWithRole, check } = await setup();
		const { organizationId } = await createOrgWithRole({ project: ["update"] });
		const other = await getTestInstance({
			advanced: {
				database: {
					generateId: ({ model }) =>
						model === "organization" ? organizationId : crypto.randomUUID(),
				},
			},
			plugins: [organization(options)],
		});
		const { headers: otherHeaders } = await other.signInWithTestUser();
		await other.auth.api.createOrganization({
			body: {
				name: "Other",
				slug: "other",
			},
			headers: otherHeaders,
		});
		const otherContext = await other.auth.$context;
		await otherContext.adapter.create({
			model: "organizationRole",
			data: {
				organizationId,
				role: "editor",
				permission: JSON.stringify({
					project: ["read"],
				}),
				createdAt: new Date(),
			},
		});
		const otherCtx = {
			context: otherContext,
		} as unknown as GenericEndpointContext;
		await runWithRequestState(new WeakMap(), async () => {
			expect(await check(organizationId, "update", true)).toBe(true);
			expect(
				await hasPermission(
					{
						organizationId,
						role: "editor",
						permissions: { project: ["update"] },
						options,
						useMemoryCache: true,
					},
					otherCtx,
				),
			).toBe(false);
			expect(await check(organizationId, "update", true)).toBe(true);
		});
	});

	it("isolates organization options that use the same adapter", async () => {
		const { ctx, createOrgWithRole } = await setup();
		const { organizationId } = await createOrgWithRole({ project: ["read"] });
		const otherOptions = {
			...options,
			roles: {
				...roles,
				admin: ac.newRole({
					...adminAc.statements,
					project: ["update"],
				}),
			},
		};
		await runWithRequestState(new WeakMap(), async () => {
			const input = {
				organizationId,
				role: "admin",
				permissions: { project: ["update"] },
				options,
				useMemoryCache: true,
			};
			expect(await hasPermission(input, ctx)).toBe(false);
			expect(
				await hasPermission(
					{
						...input,
						options: otherOptions,
					},
					ctx,
				),
			).toBe(true);
			expect(await hasPermission(input, ctx)).toBe(false);
		});
	});

	it("does not serve roles cached by a previous request", async () => {
		const { context, createOrgWithRole, check } = await setup();
		const { organizationId, roleId } = await createOrgWithRole({
			project: ["update"],
		});

		await runWithRequestState(new WeakMap(), async () => {
			expect(await check(organizationId, "update", true)).toBe(true);
		});

		await context.adapter.update({
			model: "organizationRole",
			where: [{ field: "id", value: roleId }],
			update: {
				permission: JSON.stringify({
					project: ["read"],
				}),
			},
		});

		await runWithRequestState(new WeakMap(), async () => {
			expect(await check(organizationId, "update", true)).toBe(false);
			expect(await check(organizationId, "read", true)).toBe(true);
		});
	});

	it("does not retain roles when called outside of a request context", async () => {
		const { context, createOrgWithRole, check } = await setup();
		const { organizationId, roleId } = await createOrgWithRole({
			project: ["update"],
		});

		expect(await check(organizationId, "update", true)).toBe(true);

		await context.adapter.update({
			model: "organizationRole",
			where: [{ field: "id", value: roleId }],
			update: {
				permission: JSON.stringify({
					project: ["read"],
				}),
			},
		});

		expect(await check(organizationId, "update", true)).toBe(false);
	});
});

describe("hasPermission multiple roles permission union (#3011)", () => {
	const ac = createAccessControl({
		a: ["use-a"],
		b: ["use-b"],
		project: ["create", "read", "update", "delete"],
		...defaultStatements,
	});

	const roles = {
		aUser: ac.newRole({
			a: ["use-a"],
			project: ["create"],
		}),
		bUser: ac.newRole({
			b: ["use-b"],
			project: ["read"],
		}),
	};

	const options = {
		ac,
		roles,
	} satisfies OrganizationOptions;

	it("returns true when multiple permissions are satisfied by the union of assigned roles", () => {
		const result = hasPermissionFn(
			{
				role: "aUser, bUser",
				permissions: {
					a: ["use-a"],
					b: ["use-b"],
				},
				options,
			},
			roles,
		);
		expect(result).toBe(true);
	});

	it("returns true when multiple actions on the same resource are granted across different roles", () => {
		const result = hasPermissionFn(
			{
				role: ["aUser", "bUser"],
				permissions: {
					project: ["create", "read"],
				},
				options,
			},
			roles,
		);
		expect(result).toBe(true);
	});

	it("returns false when requested permissions exceed what assigned roles grant", () => {
		const result = hasPermissionFn(
			{
				role: "aUser, bUser",
				permissions: {
					a: ["use-a"],
					b: ["use-b"],
					project: ["delete"],
				},
				options,
			},
			roles,
		);
		expect(result).toBe(false);
	});

	it("returns true when multiple permissions are checked via hasPermission with multiple roles", async () => {
		const result = await hasPermission(
			{
				organizationId: "test-org",
				role: "aUser, bUser",
				permissions: {
					a: ["use-a"],
					b: ["use-b"],
				},
				options,
			},
			{} as any,
		);
		expect(result).toBe(true);
	});
});
