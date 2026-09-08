import type {
	BetterAuthOptions,
	DBAdapter,
	DBTransactionAdapter,
	Session,
	User,
} from "better-auth";
import { betterAuth } from "better-auth";
import type { MemoryDB } from "better-auth/adapters/memory";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
	SCIMAuthorizationSource,
	SCIMProjectedRoleGrant,
	SCIMProjection,
} from ".";
import { scim } from ".";
import { createSCIMConnectionKey } from "./connection-state";

type SCIMUserRow = {
	id: string;
	connectionId: string;
	userId: string;
};

type SCIMGroupRow = {
	id: string;
	connectionId: string;
	externalId?: string;
	displayName: string;
};

type SCIMGroupMemberRow = {
	id: string;
	groupId: string;
	scimUserId: string;
};

type ProjectionSource = {
	type: "group";
	id: string;
	externalId?: string;
	displayName: string;
};

type RoleMapInput = {
	connectionId: string;
	provisioningDomainId: string;
	source: ProjectionSource;
};

type RoleExistsInput = {
	connectionId: string;
	provisioningDomainId: string;
	role: string;
};

type ProjectionGrantRow = {
	id: string;
	connectionId: string;
	provisioningDomainId: string;
	scimUserId: string;
	userId: string;
	sourceKind: "group";
	sourceId: string;
	role: string;
	grantKey: string;
};

type ReconcileUserInput = {
	provisioningDomainId: string;
	userId: string;
	active: boolean;
	sources: {
		id: string;
		connectionId: string;
		provisioningDomainId: string;
		active: boolean;
	}[];
	grants: {
		source: ProjectionSource;
		role: string;
	}[];
};

type ReconcileIdentityInput = {
	userId: string;
	active: boolean;
	profileSourceId?: string;
	sources: ReconcileUserInput["sources"];
};

it("exposes source-aware projection contracts without persistence details", () => {
	type RoleMapping = NonNullable<SCIMProjection["roles"]>["map"];
	type Source = Parameters<RoleMapping>[0]["source"];

	expectTypeOf<Source>().toEqualTypeOf<SCIMAuthorizationSource>();
	expectTypeOf<Source["type"]>().toEqualTypeOf<"group">();
	expectTypeOf<SCIMProjectedRoleGrant["source"]>().toEqualTypeOf<Source>();
});

type SCIMConnectionBindingRow = {
	id: string;
	connectionId: string;
	connectionKey: string;
	provisioningDomainId: string;
	createdAt: Date;
	decommissionStatus: "active" | "reconciling" | "complete";
	decommissionCursorUserId?: string | null;
	decommissionReconciledUserCount: number;
	decommissionBatchCount: number;
	decommissionRevision: number;
	decommissionedAt?: Date | null;
	decommissionCompletedAt?: Date | null;
	decommissionLeaseId?: string | null;
	decommissionLeaseExpiresAt?: Date | null;
};

type IncrementOneRequest = Parameters<DBAdapter["incrementOne"]>[0];

function createBindingLockingMemoryAdapter(
	data: MemoryDB,
	callbacks: {
		onBindingLockWait: () => void;
		onTransactionIncrement?: (model: string) => void;
	},
) {
	let bindingLockTail: Promise<void> | undefined;

	const acquireBindingLock = async () => {
		const previousLock = bindingLockTail;
		let releaseCurrentLock!: () => void;
		const currentLock = new Promise<void>((resolve) => {
			releaseCurrentLock = resolve;
		});
		bindingLockTail = currentLock;

		if (previousLock !== undefined) {
			callbacks.onBindingLockWait();
			await previousLock;
		}

		return () => {
			releaseCurrentLock();
			if (bindingLockTail === currentLock) bindingLockTail = undefined;
		};
	};

	return (options: BetterAuthOptions): DBAdapter => {
		const adapter = memoryAdapter(data)(options);
		const incrementOne: DBAdapter["incrementOne"] = async <Row>(
			request: IncrementOneRequest,
		): Promise<Row | null> => {
			if (request.model !== "scimConnectionBinding") {
				return adapter.incrementOne<Row>(request);
			}
			const releaseBindingLock = await acquireBindingLock();
			try {
				return await adapter.incrementOne<Row>(request);
			} finally {
				releaseBindingLock();
			}
		};

		return {
			...adapter,
			incrementOne,
			transaction: async <Result>(
				callback: (transaction: DBTransactionAdapter) => Promise<Result>,
			) => {
				let releaseBindingLock: (() => void) | undefined;
				try {
					return await adapter.transaction(async (transaction) => {
						const incrementOne: DBTransactionAdapter["incrementOne"] = async <
							Row,
						>(
							request: IncrementOneRequest,
						): Promise<Row | null> => {
							callbacks.onTransactionIncrement?.(request.model);
							if (
								request.model === "scimConnectionBinding" &&
								!releaseBindingLock
							) {
								releaseBindingLock = await acquireBindingLock();
							}
							return transaction.incrementOne<Row>(request);
						};

						return callback({ ...transaction, incrementOne });
					});
				} finally {
					releaseBindingLock?.();
				}
			},
		};
	};
}

describe("SCIM role projection", () => {
	it("projects an allowlisted custom role with source-aware provenance", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const reconciliations: ReconcileUserInput[] = [];
		let mappedRoles = ["billing-manager", "missing-role"];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						roles: {
							map: ({ source }: RoleMapInput) =>
								source.externalId === "finance-admins" ? mappedRoles : [],
							exists: ({ role }: RoleExistsInput) => role === "billing-manager",
						},
						reconcileUser: (input: ReconcileUserInput) => {
							reconciliations.push(input);
						},
					},
				}),
			],
		});
		const authorization = { authorization: "Bearer test-scim-token" };
		const createdUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "ada@example.com",
			},
			headers: authorization,
		});
		const userLink = data.scimUser.find((row) => row.id === createdUser.id);
		if (!userLink) throw new Error("Expected a SCIM User link");
		const createdGroup = await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "finance-admins",
				displayName: "Finance administrators",
				members: [{ value: createdUser.id }],
			},
			headers: authorization,
		});
		const projectionGrant = data.scimProjectionGrant.find(
			(grant) => grant.scimUserId === createdUser.id,
		);

		expect(projectionGrant).toMatchObject({
			connectionId: "workforce",
			provisioningDomainId: "workspace-acme",
			scimUserId: createdUser.id,
			userId: userLink.userId,
			sourceKind: "group",
			sourceId: createdGroup.id,
			role: "billing-manager",
			grantKey: expect.any(String),
		});
		expect(projectionGrant?.grantKey).not.toBe("");
		expect(reconciliations.at(-1)).toMatchObject({
			provisioningDomainId: "workspace-acme",
			userId: userLink.userId,
			active: true,
			sources: [
				{
					id: createdUser.id,
					connectionId: "workforce",
					provisioningDomainId: "workspace-acme",
					active: true,
				},
			],
			grants: [
				{
					source: {
						type: "group",
						id: createdGroup.id,
						externalId: "finance-admins",
						displayName: "Finance administrators",
					},
					role: "billing-manager",
				},
			],
		});
		expect(data.organization).toEqual([]);
		expect(data.member).toEqual([]);
		expect(data.account).toEqual([]);

		mappedRoles = [];
		const result = await auth.api.reconcileSCIMProjection({
			body: { provisioningDomainId: "workspace-acme" },
		});

		expect(result).toEqual({
			provisioningDomainId: "workspace-acme",
			reconciledUsers: 1,
			batches: 1,
		});
		expect(data.scimProjectionGrant).toEqual([]);
		expect(reconciliations.at(-1)).toMatchObject({
			provisioningDomainId: "workspace-acme",
			userId: userLink.userId,
			active: true,
			grants: [],
		});

		mappedRoles = [42] as unknown as string[];
		await expect(
			auth.api.reconcileSCIMProjection({
				body: { provisioningDomainId: "workspace-acme" },
			}),
		).rejects.toThrow("SCIM role mapping failed");
	});

	it("reconciles complete User lifecycle state without Groups", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			organization: [] as { id: string }[],
			member: [] as { id: string }[],
			scimConnection: [] as { id: string }[],
			scimCredential: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const reconciliations: ReconcileUserInput[] = [];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						reconcileUser: (input: ReconcileUserInput) => {
							reconciliations.push(input);
						},
					},
				}),
			],
		});
		const authorization = { authorization: "Bearer test-scim-token" };
		const createdUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "grace@example.com",
				active: true,
			},
			headers: authorization,
		});
		const userLink = data.scimUser.find((row) => row.id === createdUser.id);
		if (!userLink) throw new Error("Expected a SCIM User link");

		await auth.api.patchSCIMUser({
			params: { userId: createdUser.id },
			body: {
				schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
				Operations: [{ op: "replace", path: "active", value: false }],
			},
			headers: authorization,
		});
		await auth.api.deleteSCIMUser({
			params: { userId: createdUser.id },
			headers: authorization,
		});

		expect(
			reconciliations.map(({ active, grants }) => ({ active, grants })),
		).toEqual([
			{ active: true, grants: [] },
			{ active: false, grants: [] },
			{ active: false, grants: [] },
		]);
		expect(data.user.some((user) => user.id === userLink.userId)).toBe(true);
	});

	it("rolls back User creation when the application projection fails", async () => {
		const data = {
			user: [] as User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as { id: string }[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
						},
					],
					projection: {
						reconcileUser: () => {
							throw new Error("Application projection failed");
						},
					},
				}),
			],
		});

		await expect(
			auth.api.createSCIMUser({
				body: {
					schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
					userName: "rollback@example.com",
				},
				headers: { authorization: "Bearer test-scim-token" },
			}),
		).rejects.toThrow("SCIM projection reconciliation failed");

		expect(data.user).toEqual([]);
		expect(data.account).toEqual([]);
		expect(data.scimSubject).toEqual([]);
		expect(data.scimUser).toEqual([]);
		expect(data.scimProjectionGrant).toEqual([]);
	});

	it("decommissions one connection without resurrecting its grants", async () => {
		const now = new Date();
		const data = {
			user: [
				{
					id: "shared-user",
					name: "Shared User",
					email: "shared@example.com",
					emailVerified: true,
					image: null,
					createdAt: now,
					updatedAt: now,
				},
			] satisfies User[],
			session: [] as { id: string }[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as SCIMConnectionBindingRow[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const reconciliations: ReconcileUserInput[] = [];
		const identityReconciliations: ReconcileIdentityInput[] = [];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [
								{ type: "bearer", id: "token-a", token: "token-a" },
							],
							provisioningDomainId: "workspace-acme",
						},
						{
							id: "workforce-b",
							credentials: [
								{ type: "bearer", id: "token-b", token: "token-b" },
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					identity: {
						resolveUser: () => ({
							action: "link",
							userId: "shared-user",
							profile: "preserve",
						}),
						reconcileUser: (input: ReconcileIdentityInput) => {
							identityReconciliations.push(input);
						},
					},
					projection: {
						roles: {
							map: ({ source }: RoleMapInput) =>
								source.externalId ? [source.externalId] : [],
							exists: () => true,
						},
						reconcileUser: (input: ReconcileUserInput) => {
							reconciliations.push(input);
						},
					},
				}),
			],
		});
		const userA = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-a@example.com",
			},
			headers: { authorization: "Bearer token-a" },
		});
		const userB = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "source-b@example.com",
			},
			headers: { authorization: "Bearer token-b" },
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "role-a",
				displayName: "Role A",
				members: [{ value: userA.id }],
			},
			headers: { authorization: "Bearer token-a" },
		});
		await auth.api.createSCIMGroup({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
				externalId: "role-b",
				displayName: "Role B",
				members: [{ value: userB.id }],
			},
			headers: { authorization: "Bearer token-b" },
		});

		expect(data.scimProjectionGrant.map((grant) => grant.role).sort()).toEqual([
			"role-a",
			"role-b",
		]);

		const result = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce-a" },
		});

		expect(result).toEqual({
			connectionId: "workforce-a",
			provisioningDomainId: "workspace-acme",
			status: "complete",
			decommissionedAt: expect.any(Date),
			completedAt: expect.any(Date),
			retryAfter: null,
			reconciledUsers: 1,
			batches: 1,
		});
		expect(data.scimProjectionGrant.map((grant) => grant.role)).toEqual([
			"role-b",
		]);
		expect(reconciliations.at(-1)).toMatchObject({
			provisioningDomainId: "workspace-acme",
			userId: "shared-user",
			active: true,
			sources: [
				{
					id: userB.id,
					connectionId: "workforce-b",
					provisioningDomainId: "workspace-acme",
					active: true,
				},
			],
			grants: [{ role: "role-b" }],
		});
		expect(identityReconciliations.at(-1)).toMatchObject({
			userId: "shared-user",
			active: true,
			sources: [
				{
					id: userB.id,
					connectionId: "workforce-b",
					provisioningDomainId: "workspace-acme",
					active: true,
				},
			],
		});
		expect(data.scimUser.map((user) => user.id).sort()).toEqual(
			[userA.id, userB.id].sort(),
		);

		const rejected = await auth.handler(
			new Request("http://localhost:3000/api/auth/scim/v2/Users", {
				headers: { authorization: "Bearer token-a" },
			}),
		);
		expect(rejected.status).toBe(401);
		expect(rejected.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);

		const firstDecommissionedAt = data.scimConnectionBinding.find(
			(binding) => binding.connectionId === "workforce-a",
		)?.decommissionedAt;
		const repeatedResult = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce-a" },
		});
		expect(repeatedResult).toEqual(result);
		expect(
			data.scimConnectionBinding.find(
				(binding) => binding.connectionId === "workforce-a",
			)?.decommissionedAt,
		).toEqual(firstDecommissionedAt);
		expect(data.scimProjectionGrant.map((grant) => grant.role)).toEqual([
			"role-b",
		]);
	});

	it("rolls back an authenticated mutation fenced after decommissioning", async () => {
		const data = {
			user: [] as User[],
			session: [] as Session[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as SCIMConnectionBindingRow[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as { id: string; userId: string }[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		let markResolutionStarted: (() => void) | undefined;
		const resolutionStarted = new Promise<void>((resolve) => {
			markResolutionStarted = resolve;
		});
		let releaseResolution: (() => void) | undefined;
		const resolutionReleased = new Promise<void>((resolve) => {
			releaseResolution = resolve;
		});
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					identity: {
						async resolveUser() {
							markResolutionStarted?.();
							await resolutionReleased;
							return { action: "create" };
						},
					},
				}),
			],
		});

		const create = auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "in-flight@example.com",
			},
			headers: { authorization: "Bearer test-scim-token" },
		});
		await resolutionStarted;
		const decommissioned = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce" },
		});
		releaseResolution?.();

		await expect(create).rejects.toThrow("SCIM connection is decommissioned");
		expect(decommissioned.status).toBe("complete");
		expect(data.user).toEqual([]);
		expect(data.scimSubject).toEqual([]);
		expect(data.scimUser).toEqual([]);
	});

	it("fails closed on a non-active binding without retirement metadata", async () => {
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const sources: ReconcileUserInput["sources"][] = [];
		const data = {
			user: [] as User[],
			session: [] as Session[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [
				{
					id: "binding-a",
					connectionId: "workforce-a",
					connectionKey: createSCIMConnectionKey("workforce-a"),
					provisioningDomainId: "workspace-acme",
					createdAt,
					decommissionStatus: "complete",
					decommissionReconciledUserCount: 1,
					decommissionBatchCount: 1,
					decommissionRevision: 3,
				},
			] satisfies SCIMConnectionBindingRow[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [
				{
					id: "subject",
					userId: "user",
					revision: 0,
					createdAt,
					updatedAt: createdAt,
				},
			],
			scimUser: [
				{
					id: "scim-user-a",
					connectionId: "workforce-a",
					provisioningDomainId: "workspace-acme",
					userId: "user",
					active: true,
				},
				{
					id: "scim-user-b",
					connectionId: "workforce-b",
					provisioningDomainId: "workspace-acme",
					userId: "user",
					active: true,
				},
			],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-a",
							credentials: [
								{ type: "bearer", id: "token-a", token: "token-a" },
							],
							provisioningDomainId: "workspace-acme",
						},
						{
							id: "workforce-b",
							credentials: [
								{ type: "bearer", id: "token-b", token: "token-b" },
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						reconcileUser: (state: ReconcileUserInput) => {
							sources.push(state.sources);
						},
					},
				}),
			],
		});

		await auth.api.reconcileSCIMProjection({
			body: { provisioningDomainId: "workspace-acme" },
		});
		const rejected = await auth.handler(
			new Request("http://localhost:3000/api/auth/scim/v2/Users", {
				headers: { authorization: "Bearer token-a" },
			}),
		);

		expect(sources.at(-1)).toEqual([
			{
				id: "scim-user-b",
				connectionId: "workforce-b",
				provisioningDomainId: "workspace-acme",
				active: true,
			},
		]);
		expect(rejected.status).toBe(401);
		expect(rejected.headers.get("www-authenticate")).toBe(
			'Bearer realm="SCIM"',
		);
	});

	it("checkpoints failed decommissioning and resumes from the next user", async () => {
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const scimUsers = Array.from({ length: 51 }, (_, index) => {
			const suffix = index.toString().padStart(3, "0");
			return {
				id: `scim-user-${suffix}`,
				connectionId: "workforce",
				provisioningDomainId: "workspace-acme",
				userId: `user-${suffix}`,
				active: true,
			};
		});
		const binding: SCIMConnectionBindingRow = {
			id: "binding",
			connectionId: "workforce",
			connectionKey: createSCIMConnectionKey("workforce"),
			provisioningDomainId: "workspace-acme",
			createdAt,
			decommissionStatus: "active",
			decommissionReconciledUserCount: 0,
			decommissionBatchCount: 0,
			decommissionRevision: 0,
		};
		const data = {
			user: [] as User[],
			session: [] as Session[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [binding],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: scimUsers.map((scimUser, index) => ({
				id: `subject-${index.toString().padStart(3, "0")}`,
				userId: scimUser.userId,
				revision: 0,
				createdAt,
				updatedAt: createdAt,
			})),
			scimUser: scimUsers,
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const attempts = new Map<string, number>();
		let failLastUser = true;
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						reconcileUser: ({ userId }: ReconcileUserInput) => {
							attempts.set(userId, (attempts.get(userId) ?? 0) + 1);
							if (failLastUser && userId === "user-050") {
								throw new Error("Projection unavailable");
							}
						},
					},
				}),
			],
		});

		await expect(
			auth.api.decommissionSCIMConnection({
				body: { connectionId: "workforce" },
			}),
		).rejects.toThrow("SCIM projection reconciliation failed");

		expect(data.scimConnectionBinding[0]).toMatchObject({
			decommissionStatus: "reconciling",
			decommissionCursorUserId: "user-049",
			decommissionReconciledUserCount: 50,
			decommissionBatchCount: 1,
			decommissionCompletedAt: null,
			decommissionLeaseId: null,
			decommissionLeaseExpiresAt: null,
			decommissionedAt: expect.any(Date),
		});
		const rejected = await auth.handler(
			new Request("http://localhost:3000/api/auth/scim/v2/Users", {
				headers: { authorization: "Bearer test-scim-token" },
			}),
		);
		expect(rejected.status).toBe(401);

		failLastUser = false;
		const result = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce" },
		});

		expect(result).toEqual({
			connectionId: "workforce",
			provisioningDomainId: "workspace-acme",
			status: "complete",
			decommissionedAt: expect.any(Date),
			completedAt: expect.any(Date),
			retryAfter: null,
			reconciledUsers: 51,
			batches: 2,
		});
		expect(attempts.get("user-000")).toBe(1);
		expect(attempts.get("user-049")).toBe(1);
		expect(attempts.get("user-050")).toBe(2);
		expect(data.scimConnectionBinding[0]).toMatchObject({
			decommissionStatus: "complete",
			decommissionCursorUserId: "user-050",
			decommissionReconciledUserCount: 51,
			decommissionBatchCount: 2,
			decommissionCompletedAt: expect.any(Date),
			decommissionLeaseId: null,
			decommissionLeaseExpiresAt: null,
		});
	});

	it("prevents takeover after the renewed lease expires during reconciliation", async () => {
		const clockStart = new Date("2026-01-01T00:00:00.000Z");
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(clockStart);

		let releaseReconciliation: (() => void) | undefined;
		try {
			const data = {
				user: [] as User[],
				session: [] as Session[],
				verification: [] as { id: string }[],
				account: [] as { id: string }[],
				scimConnectionBinding: [
					{
						id: "binding",
						connectionId: "workforce",
						connectionKey: createSCIMConnectionKey("workforce"),
						provisioningDomainId: "workspace-acme",
						createdAt: clockStart,
						decommissionStatus: "active",
						decommissionReconciledUserCount: 0,
						decommissionBatchCount: 0,
						decommissionRevision: 0,
					},
				] satisfies SCIMConnectionBindingRow[],
				scimIdentityTombstone: [] as { id: string }[],
				scimSubject: [
					{
						id: "subject",
						userId: "user",
						revision: 0,
						createdAt: clockStart,
						updatedAt: clockStart,
					},
				],
				scimUser: [
					{
						id: "scim-user",
						connectionId: "workforce",
						provisioningDomainId: "workspace-acme",
						userId: "user",
						active: true,
					},
				],
				scimGroup: [] as SCIMGroupRow[],
				scimGroupMember: [] as SCIMGroupMemberRow[],
				scimProjectionGrant: [] as ProjectionGrantRow[],
			};
			const reconciliationReleased = new Promise<void>((resolve) => {
				releaseReconciliation = resolve;
			});
			let markReconciliationStarted: (() => void) | undefined;
			const reconciliationStarted = new Promise<void>((resolve) => {
				markReconciliationStarted = resolve;
			});
			let reportConcurrencyOutcome:
				| ((outcome: "blocked" | "duplicate-callback") => void)
				| undefined;
			const concurrencyOutcome = new Promise<"blocked" | "duplicate-callback">(
				(resolve) => {
					reportConcurrencyOutcome = resolve;
				},
			);
			let calls = 0;
			const lockOrder: string[] = [];
			const auth = betterAuth({
				baseURL: "http://localhost:3000",
				database: createBindingLockingMemoryAdapter(data, {
					onBindingLockWait() {
						reportConcurrencyOutcome?.("blocked");
					},
					onTransactionIncrement(model) {
						lockOrder.push(model);
					},
				}),
				plugins: [
					scim({
						connections: [
							{
								id: "workforce",
								credentials: [
									{
										type: "bearer",
										id: "test-scim-token",
										token: "test-scim-token",
									},
								],
								provisioningDomainId: "workspace-acme",
							},
						],
						projection: {
							async reconcileUser() {
								lockOrder.push("callback");
								calls++;
								if (calls > 1) {
									reportConcurrencyOutcome?.("duplicate-callback");
								}
								markReconciliationStarted?.();
								await reconciliationReleased;
							},
						},
					}),
				],
			});

			const first = auth.api.decommissionSCIMConnection({
				body: { connectionId: "workforce" },
			});
			await reconciliationStarted;
			vi.setSystemTime(new Date(clockStart.getTime() + 10 * 60 * 1000));
			const concurrent = auth.api.decommissionSCIMConnection({
				body: { connectionId: "workforce" },
			});
			const outcome = await concurrencyOutcome;
			releaseReconciliation?.();
			const [completed, concurrentResult] = await Promise.all([
				first,
				concurrent,
			]);

			expect(outcome).toBe("blocked");
			expect(completed).toMatchObject({
				status: "complete",
				reconciledUsers: 1,
				batches: 1,
			});
			expect(concurrentResult).toMatchObject({
				status: "complete",
				reconciledUsers: 1,
				batches: 1,
			});
			expect(lockOrder.slice(0, 3)).toEqual([
				"scimSubject",
				"scimConnectionBinding",
				"callback",
			]);
			expect(calls).toBe(1);
		} finally {
			releaseReconciliation?.();
			vi.useRealTimers();
		}
	});

	it("takes over an expired decommission worker lease", async () => {
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const decommissionedAt = new Date("2026-01-02T00:00:00.000Z");
		const data = {
			user: [] as User[],
			session: [] as Session[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [
				{
					id: "binding",
					connectionId: "workforce",
					connectionKey: createSCIMConnectionKey("workforce"),
					provisioningDomainId: "workspace-acme",
					createdAt,
					decommissionStatus: "reconciling",
					decommissionCursorUserId: "user-049",
					decommissionReconciledUserCount: 50,
					decommissionBatchCount: 1,
					decommissionRevision: 3,
					decommissionedAt,
					decommissionLeaseId: "stopped-worker",
					decommissionLeaseExpiresAt: new Date(Date.now() - 60_000),
				},
			] satisfies SCIMConnectionBindingRow[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [
				{
					id: "subject",
					userId: "user-050",
					revision: 0,
					createdAt,
					updatedAt: createdAt,
				},
			],
			scimUser: [
				{
					id: "scim-user-050",
					connectionId: "workforce",
					provisioningDomainId: "workspace-acme",
					userId: "user-050",
					active: true,
				},
			],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const reconciledUsers: string[] = [];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						reconcileUser: ({ userId }: ReconcileUserInput) => {
							reconciledUsers.push(userId);
						},
					},
				}),
			],
		});

		const result = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce" },
		});

		expect(result).toEqual({
			connectionId: "workforce",
			provisioningDomainId: "workspace-acme",
			status: "complete",
			decommissionedAt,
			completedAt: expect.any(Date),
			retryAfter: null,
			reconciledUsers: 51,
			batches: 2,
		});
		expect(reconciledUsers).toEqual(["user-050"]);
		expect(data.scimConnectionBinding[0]).toMatchObject({
			decommissionStatus: "complete",
			decommissionReconciledUserCount: 51,
			decommissionBatchCount: 2,
			decommissionLeaseId: null,
			decommissionLeaseExpiresAt: null,
		});
	});

	it("bounds explicit domain reconciliation batches and keeps both APIs server-only", async () => {
		const createdAt = new Date("2026-01-01T00:00:00.000Z");
		const scimUsers = Array.from({ length: 51 }, (_, index) => {
			const suffix = index.toString().padStart(3, "0");
			return {
				id: `scim-user-${suffix}`,
				connectionId: "workforce",
				provisioningDomainId: "workspace-acme",
				userId: `user-${suffix}`,
				active: true,
			};
		});
		const reconciledUserIds: string[] = [];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter({
				user: [] as User[],
				session: [] as { id: string }[],
				verification: [] as { id: string }[],
				account: [] as { id: string }[],
				scimConnectionBinding: [] as { id: string }[],
				scimSubject: scimUsers.map((scimUser, index) => ({
					id: `subject-${index.toString().padStart(3, "0")}`,
					userId: scimUser.userId,
					revision: 0,
					createdAt,
					updatedAt: createdAt,
				})),
				scimUser: scimUsers,
				scimGroup: [] as SCIMGroupRow[],
				scimGroupMember: [] as SCIMGroupMemberRow[],
				scimProjectionGrant: [] as ProjectionGrantRow[],
			}),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					projection: {
						reconcileUser: ({ userId }: ReconcileUserInput) => {
							reconciledUserIds.push(userId);
						},
					},
				}),
			],
		});

		const result = await auth.api.reconcileSCIMProjection({
			body: { provisioningDomainId: "workspace-acme" },
		});
		const serverApi = auth.api as unknown as Record<string, { path?: string }>;

		expect(result).toEqual({
			provisioningDomainId: "workspace-acme",
			reconciledUsers: 51,
			batches: 2,
		});
		expect(new Set(reconciledUserIds).size).toBe(51);
		expect(serverApi.reconcileSCIMProjection?.path).toBeFalsy();
		expect(serverApi.decommissionSCIMConnection?.path).toBeFalsy();
	});

	it("decommissions lifecycle state without requiring an access projection", async () => {
		const data = {
			user: [] as User[],
			session: [] as Session[],
			verification: [] as { id: string }[],
			account: [] as { id: string }[],
			scimConnectionBinding: [] as SCIMConnectionBindingRow[],
			scimIdentityTombstone: [] as { id: string }[],
			scimSubject: [] as {
				id: string;
				userId: string;
				profileSourceId?: string | null;
			}[],
			scimUser: [] as SCIMUserRow[],
			scimGroup: [] as SCIMGroupRow[],
			scimGroupMember: [] as SCIMGroupMemberRow[],
			scimProjectionGrant: [] as ProjectionGrantRow[],
		};
		const identityReconciliations: ReconcileIdentityInput[] = [];
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database: memoryAdapter(data),
			plugins: [
				scim({
					connections: [
						{
							id: "workforce",
							credentials: [
								{
									type: "bearer",
									id: "test-scim-token",
									token: "test-scim-token",
								},
							],
							provisioningDomainId: "workspace-acme",
						},
					],
					identity: {
						reconcileUser: (input: ReconcileIdentityInput) => {
							identityReconciliations.push(input);
						},
					},
				}),
			],
		});
		const createdUser = await auth.api.createSCIMUser({
			body: {
				schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
				userName: "managed@example.com",
			},
			headers: { authorization: "Bearer test-scim-token" },
		});
		const linkedUser = data.scimUser.find((user) => user.id === createdUser.id);
		if (!linkedUser) throw new Error("Expected linked SCIM User");
		data.scimProjectionGrant.push({
			id: "stale-grant",
			connectionId: "workforce",
			provisioningDomainId: "workspace-acme",
			scimUserId: createdUser.id,
			userId: linkedUser.userId,
			sourceKind: "group",
			sourceId: "retired-group",
			role: "retired-role",
			grantKey: "stale-grant-key",
		});
		const sessionTime = new Date();
		data.session.push({
			id: "session",
			userId: linkedUser.userId,
			token: "session-token",
			expiresAt: new Date(sessionTime.getTime() + 60_000),
			ipAddress: null,
			userAgent: null,
			createdAt: sessionTime,
			updatedAt: sessionTime,
		});

		const result = await auth.api.decommissionSCIMConnection({
			body: { connectionId: "workforce" },
		});

		expect(result).toEqual({
			connectionId: "workforce",
			provisioningDomainId: "workspace-acme",
			status: "complete",
			decommissionedAt: expect.any(Date),
			completedAt: expect.any(Date),
			retryAfter: null,
			reconciledUsers: 1,
			batches: 1,
		});
		expect(identityReconciliations.at(-1)).toEqual({
			userId: linkedUser.userId,
			active: false,
			sources: [],
		});
		expect(data.session).toEqual([]);
		expect(data.scimProjectionGrant).toEqual([]);
		expect(data.scimSubject[0]?.profileSourceId).toBeNull();
		expect(data.scimUser).toHaveLength(1);
	});
});
