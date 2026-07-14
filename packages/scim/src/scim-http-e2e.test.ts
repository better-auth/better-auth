import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { runSCIMLifecycle } from "@better-auth/test-utils/scim";
import { getMigrations } from "better-auth/db/migration";
import { getHttpTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";
import { scim } from ".";
import type { SCIMProjectedUserState } from "./types";

describe("SCIM HTTP end-to-end", () => {
	it("normalizes SCIM DELETE requests from runtimes with empty body streams", async () => {
		const plugin = scim({
			connections: [
				{
					id: "streaming-runtime",
					credentials: [{ type: "bearer", token: "streaming-token" }],
				},
			],
		});
		const request = new Request("https://example.com/scim/v2/Users/user-1", {
			method: "DELETE",
			headers: { authorization: "Bearer streaming-token" },
			body: new Blob([]),
		});

		const result = await plugin.onRequest?.(request, undefined as never);

		expect(
			result && "request" in result ? result.request.body : undefined,
		).toBe(null);
		expect(
			result && "request" in result
				? result.request.headers.get("authorization")
				: undefined,
		).toBe("Bearer streaming-token");
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8549
	 */
	it("provisions users and groups through a real HTTP listener", async ({
		onTestFinished,
	}) => {
		const sqlite = new DatabaseSync(":memory:");
		const projectedStates: SCIMProjectedUserState[] = [];
		let rejectRoleProjection = false;
		const role = "billing-manager";
		const instance = await getHttpTestInstance(
			{
				database: {
					dialect: new NodeSqliteDialect({ database: sqlite }),
					type: "sqlite",
					transaction: true,
				},
				user: {
					additionalFields: {
						scimTestRole: { type: "string", required: false },
					},
				},
				plugins: [
					scim({
						connections: [
							{
								id: "sqlite-workforce",
								provisioningDomainId: "workspace-sqlite",
								credentials: [{ type: "bearer", token: "sqlite-scim-token" }],
							},
						],
						projection: {
							roles: {
								map: ({ source }) =>
									source.externalId === "sqlite-finance-admins" ? [role] : [],
								exists: ({ role: candidate }) => candidate === role,
							},
							async reconcileUser(state, context) {
								await context.database.update({
									model: "user",
									where: [{ field: "id", value: state.userId }],
									update: {
										scimTestRole: state.grants[0]?.role ?? null,
									},
								});
								if (
									rejectRoleProjection &&
									state.grants.some((grant) => grant.role === role)
								) {
									throw new Error("Injected SCIM role projection failure");
								}
								projectedStates.push({
									...state,
									sources: [...state.sources],
									grants: [...state.grants],
								});
							},
						},
					}),
				],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(async () => {
			await instance.server.close();
			sqlite.close();
		});
		await (await getMigrations(instance.auth.options)).runMigrations();
		let groupRevisionBeforeFailedAdd: number | undefined;
		let subjectRevisionBeforeFailedAdd: number | undefined;
		const checkpointsWithRole = new Set([
			"member-added",
			"member-restored",
			"user-reactivated",
			"reprovisioned-member-added",
		]);
		const checkpointsWithMembership = new Set([
			"member-added",
			"member-restored",
			"user-deactivated",
			"user-reactivated",
			"reprovisioned-member-added",
		]);

		const result = await runSCIMLifecycle({
			baseURL: instance.baseURL,
			token: "sqlite-scim-token",
			testId: "sqlite",
			projectionFailure: {
				enable() {
					rejectRoleProjection = true;
				},
				disable() {
					rejectRoleProjection = false;
				},
			},
			async onCheckpoint(checkpoint) {
				const [users, groups, subjects, memberships, grants] =
					await Promise.all([
						instance.db.findMany<{
							id: string;
							scimTestRole?: string | null;
						}>({ model: "user", where: [] }),
						instance.db.findMany<{ revision: number }>({
							model: "scimGroup",
							where: [],
						}),
						instance.db.findMany<{ revision: number }>({
							model: "scimSubject",
							where: [],
						}),
						instance.db.findMany({ model: "scimGroupMember", where: [] }),
						instance.db.findMany({
							model: "scimProjectionGrant",
							where: [],
						}),
					]);
				if (checkpoint === "group-created") {
					expect(groups).toHaveLength(1);
					expect(subjects).toHaveLength(1);
					expect(groups[0]?.revision).toEqual(expect.any(Number));
					expect(subjects[0]?.revision).toEqual(expect.any(Number));
					groupRevisionBeforeFailedAdd = groups[0]?.revision;
					subjectRevisionBeforeFailedAdd = subjects[0]?.revision;
				}
				if (checkpoint === "failed-add-rolled-back") {
					expect(groups).toHaveLength(1);
					expect(subjects).toHaveLength(1);
					expect(groups[0]?.revision).toBe(groupRevisionBeforeFailedAdd);
					expect(subjects[0]?.revision).toBe(subjectRevisionBeforeFailedAdd);
				}
				expect(users).toHaveLength(1);
				expect(users[0]?.scimTestRole ?? null).toBe(
					checkpointsWithRole.has(checkpoint) ? role : null,
				);
				expect(grants).toHaveLength(
					checkpointsWithRole.has(checkpoint) ? 1 : 0,
				);
				expect(memberships).toHaveLength(
					checkpointsWithMembership.has(checkpoint) ? 1 : 0,
				);
			},
		});

		const grantedAt = projectedStates.findIndex((state) =>
			state.grants.some(
				(grant) =>
					grant.role === "billing-manager" && grant.sourceId === result.groupId,
			),
		);
		const revokedAt = projectedStates.findIndex(
			(state, index) => index > grantedAt && state.grants.length === 0,
		);
		const deactivatedAt = projectedStates.findIndex(
			(state, index) => index > revokedAt && !state.active,
		);
		const reactivatedAt = projectedStates.findIndex(
			(state, index) =>
				index > deactivatedAt &&
				state.active &&
				state.grants.some((grant) => grant.role === role),
		);
		expect(grantedAt).toBeGreaterThanOrEqual(0);
		expect(revokedAt).toBeGreaterThan(grantedAt);
		expect(deactivatedAt).toBeGreaterThan(revokedAt);
		expect(projectedStates[deactivatedAt]?.grants).toEqual([]);
		expect(reactivatedAt).toBeGreaterThan(deactivatedAt);

		const [
			accounts,
			users,
			scimUsers,
			scimGroups,
			memberships,
			grants,
			subjects,
			tombstones,
		] = await Promise.all([
			instance.db.findMany({ model: "account", where: [] }),
			instance.db.findMany<{ id: string; scimTestRole?: string | null }>({
				model: "user",
				where: [],
			}),
			instance.db.findMany({ model: "scimUser", where: [] }),
			instance.db.findMany({ model: "scimGroup", where: [] }),
			instance.db.findMany({ model: "scimGroupMember", where: [] }),
			instance.db.findMany({ model: "scimProjectionGrant", where: [] }),
			instance.db.findMany<{ userId: string }>({
				model: "scimSubject",
				where: [],
			}),
			instance.db.findMany<{ userId: string }>({
				model: "scimIdentityTombstone",
				where: [],
			}),
		]);
		expect(accounts).toEqual([]);
		expect(users).toHaveLength(1);
		expect(users[0]?.scimTestRole ?? null).toBeNull();
		expect(scimUsers).toEqual([]);
		expect(scimGroups).toEqual([]);
		expect(memberships).toEqual([]);
		expect(grants).toEqual([]);
		expect(subjects).toHaveLength(1);
		expect(subjects[0]?.userId).toBe(users[0]?.id);
		expect(tombstones).toHaveLength(1);
		expect(tombstones[0]?.userId).toBe(users[0]?.id);
		expect(new Set(projectedStates.map((state) => state.userId))).toEqual(
			new Set([users[0]?.id]),
		);
	});
});
