import type { BetterAuthOptions } from "@better-auth/core";
import { scim } from "@better-auth/scim";
import { createTestSuite } from "@better-auth/test-utils/adapter";
import { runSCIMLifecycle } from "@better-auth/test-utils/scim";
import { toNodeHandler } from "better-auth/node";
import { createHttpTestServer } from "better-auth/test";
import { expect } from "vitest";

interface SCIMHttpTestSuiteOptions {
	connectionId: string;
	token: string;
	testId: string;
}

interface SCIMTestUser {
	id: string;
	scimTestRole?: string | null;
}

interface RevisionRow {
	revision: number;
}

export function scimHttpTestSuite(options: SCIMHttpTestSuiteOptions) {
	let rejectRoleProjection = false;
	const role = `${options.testId}-billing-manager`;
	const groupExternalId = `${options.testId}-finance-admins`;
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
	const scimBetterAuthOptions: BetterAuthOptions = {
		user: {
			additionalFields: {
				scimTestRole: { type: "string", required: false },
			},
		},
		plugins: [
			scim({
				connections: [
					{
						id: options.connectionId,
						credentials: [
							{
								id: `${options.testId}-primary`,
								type: "bearer",
								token: options.token,
							},
						],
					},
				],
				projection: {
					roles: {
						map: ({ source }) =>
							source.externalId === groupExternalId ? [role] : [],
						exists: ({ role: candidate }) => candidate === role,
					},
					async reconcileUser(state, context) {
						await context.database.update({
							model: "user",
							where: [{ field: "id", value: state.userId }],
							update: { scimTestRole: state.grants[0]?.role ?? null },
						});
						if (
							rejectRoleProjection &&
							state.grants.some((grant) => grant.role === role)
						) {
							throw new Error("Injected SCIM role projection failure");
						}
					},
				},
			}),
		],
	};

	return createTestSuite(
		"scim-http",
		{},
		({ adapter, getAuth, modifyBetterAuthOptions }) => ({
			"provisions users and groups through a real HTTP listener": {
				migrateBetterAuth: scimBetterAuthOptions,
				async test() {
					const listener = await createHttpTestServer();
					let groupRevisionBeforeFailedAdd: number | undefined;
					let subjectRevisionBeforeFailedAdd: number | undefined;
					try {
						await modifyBetterAuthOptions(
							{ ...scimBetterAuthOptions, baseURL: listener.url },
							false,
						);
						const auth = await getAuth();
						listener.setRequestHandler(toNodeHandler(auth.handler));
						await runSCIMLifecycle({
							baseURL: listener.url,
							token: options.token,
							testId: options.testId,
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
										adapter.findMany<SCIMTestUser>({
											model: "user",
											where: [],
										}),
										adapter.findMany<RevisionRow>({
											model: "scimGroup",
											where: [],
										}),
										adapter.findMany<RevisionRow>({
											model: "scimSubject",
											where: [],
										}),
										adapter.findMany({
											model: "scimGroupMember",
											where: [],
										}),
										adapter.findMany({
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
									expect(groups[0]?.revision).toBe(
										groupRevisionBeforeFailedAdd,
									);
									expect(subjects[0]?.revision).toBe(
										subjectRevisionBeforeFailedAdd,
									);
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
					} finally {
						await listener.close();
					}
				},
			},
		}),
	)();
}
