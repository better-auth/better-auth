import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { AuthContext, DBAdapter, DBTransactionAdapter } from "better-auth";
import { BetterAuthError, generateId } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import * as z from "zod";
import {
	createSCIMConnectionKey,
	findDecommissionedSCIMConnectionIds,
} from "./connection-state";
import type { SCIMIdentityCoordinator } from "./identity";
import { runSCIMApplicationCallback } from "./scim-error";
import { assertNativeSCIMTransactions } from "./transaction";
import type {
	SCIMAuthorizationSource,
	SCIMConnectionBinding,
	SCIMGroup,
	SCIMGroupMember,
	SCIMIdentitySource,
	SCIMOptions,
	SCIMProjectedRoleGrant,
	SCIMProjectionGrant,
	SCIMSubject,
	SCIMUser,
} from "./types";
import { createScopedKey } from "./utils";

export type SCIMProjectionCoordinator = ReturnType<
	typeof createSCIMProjectionCoordinator
>;

const SCIM_PROJECTION_BATCH_SIZE = 50;
const SCIM_DECOMMISSION_LEASE_DURATION_MS = 5 * 60 * 1000;
const SCIM_PROJECTION_SUBJECT_CONFLICT = Symbol(
	"scim-projection-subject-conflict",
);

type SCIMProjectionSubjectConflict = BetterAuthError & {
	[SCIM_PROJECTION_SUBJECT_CONFLICT]: true;
};

const reconcileProjectionBodySchema = z.object({
	provisioningDomainId: z.string().trim().min(1).max(255),
});

const decommissionConnectionBodySchema = z.object({
	connectionId: z.string().trim().min(1).max(255),
});

function normalizeMappedRoles(roles?: readonly string[]): string[] {
	if (!roles) return [];
	const normalizedRoles = new Set<string>();
	for (const candidate of roles) {
		const role = candidate.trim();
		if (!role) continue;
		normalizedRoles.add(role);
	}
	return [...normalizedRoles];
}

function concurrentProjectionSubjectMutation(): never {
	const error = new BetterAuthError(
		"The SCIM projection subject changed concurrently; retry the request.",
	) as SCIMProjectionSubjectConflict;
	error[SCIM_PROJECTION_SUBJECT_CONFLICT] = true;
	throw error;
}

/** Whether a complete-state projection must be retried in a fresh transaction. */
export function isSCIMProjectionSubjectConflict(
	error: unknown,
): error is SCIMProjectionSubjectConflict {
	return (
		error instanceof BetterAuthError &&
		SCIM_PROJECTION_SUBJECT_CONFLICT in error
	);
}

async function acquireProjectionSubjectLocks(
	database: DBTransactionAdapter,
	provisioningDomainId: string,
	scimUserIds: readonly string[],
): Promise<void> {
	const affectedUserIds = new Set<string>();
	for (
		let offset = 0;
		offset < scimUserIds.length;
		offset += SCIM_PROJECTION_BATCH_SIZE
	) {
		const scimUsers = await database.findMany<Pick<SCIMUser, "userId">>({
			model: "scimUser",
			where: [
				{
					field: "id",
					value: scimUserIds.slice(offset, offset + SCIM_PROJECTION_BATCH_SIZE),
					operator: "in",
				},
				{ field: "provisioningDomainId", value: provisioningDomainId },
			],
		});
		for (const scimUser of scimUsers) affectedUserIds.add(scimUser.userId);
	}
	const userIds = [...affectedUserIds].sort();
	if (userIds.length === 0) return;

	const subjectByUserId = new Map<string, SCIMSubject>();
	for (
		let offset = 0;
		offset < userIds.length;
		offset += SCIM_PROJECTION_BATCH_SIZE
	) {
		const subjects = await database.findMany<SCIMSubject>({
			model: "scimSubject",
			where: [
				{
					field: "userId",
					value: userIds.slice(offset, offset + SCIM_PROJECTION_BATCH_SIZE),
					operator: "in",
				},
			],
		});
		for (const subject of subjects) {
			subjectByUserId.set(subject.userId, subject);
		}
	}
	if (subjectByUserId.size !== userIds.length) {
		throw new BetterAuthError(
			"A SCIM User selected for projection has no subject aggregate.",
		);
	}

	const updatedAt = new Date();
	for (const userId of userIds) {
		const subject = subjectByUserId.get(userId);
		if (!subject) {
			throw new BetterAuthError(
				"A SCIM User selected for projection has no subject aggregate.",
			);
		}
		const acquired = await database.incrementOne<SCIMSubject>({
			model: "scimSubject",
			where: [
				{ field: "id", value: subject.id },
				{ field: "revision", value: subject.revision },
			],
			increment: { revision: 1 },
			set: { updatedAt },
		});
		if (!acquired) concurrentProjectionSubjectMutation();
	}
}

function createProjectionGrantKey(input: {
	connectionId: string;
	scimUserId: string;
	sourceKind: SCIMAuthorizationSource["kind"];
	sourceId: string;
	role: string;
}) {
	return createScopedKey([
		"scim-projection-grant",
		input.connectionId,
		input.scimUserId,
		input.sourceKind,
		input.sourceId,
		input.role,
	]);
}

async function buildDesiredGrants(
	options: SCIMOptions,
	database: DBTransactionAdapter,
	input: {
		provisioningDomainId: string;
		userId: string;
		activeSCIMUsers: SCIMUser[];
		memberships?: readonly SCIMGroupMember[];
		groupById?: ReadonlyMap<string, SCIMGroup>;
	},
) {
	const roleProjection = options.projection?.roles;
	if (!roleProjection || input.activeSCIMUsers.length === 0) return [];

	const scimUserById = new Map(
		input.activeSCIMUsers.map((scimUser) => [scimUser.id, scimUser]),
	);
	const memberships =
		input.memberships ??
		(await database.findMany<SCIMGroupMember>({
			model: "scimGroupMember",
			where: [
				{
					field: "scimUserId",
					value: input.activeSCIMUsers.map((scimUser) => scimUser.id),
					operator: "in",
				},
			],
		}));
	if (memberships.length === 0) return [];

	const groupById =
		input.groupById ??
		new Map(
			(
				await database.findMany<SCIMGroup>({
					model: "scimGroup",
					where: [
						{
							field: "id",
							value: [
								...new Set(memberships.map((membership) => membership.groupId)),
							],
							operator: "in",
						},
					],
				})
			).map((group) => [group.id, group]),
		);
	const desiredGrants = new Map<
		string,
		Omit<SCIMProjectionGrant, "createdAt" | "id" | "updatedAt">
	>();
	const roleExistenceByKey = new Map<string, boolean>();

	for (const membership of memberships) {
		const scimUser = scimUserById.get(membership.scimUserId);
		const group = groupById.get(membership.groupId);
		if (
			!scimUser ||
			!group ||
			group.connectionId !== scimUser.connectionId ||
			group.provisioningDomainId !== input.provisioningDomainId
		) {
			continue;
		}
		const source = {
			kind: "group",
			id: group.id,
			...(group.externalId ? { externalId: group.externalId } : {}),
			displayName: group.displayName,
		} as const satisfies SCIMAuthorizationSource;
		const mappedRoles = await runSCIMApplicationCallback(
			async () =>
				normalizeMappedRoles(
					await roleProjection.map(
						{
							connectionId: scimUser.connectionId,
							provisioningDomainId: input.provisioningDomainId,
							scimUserId: scimUser.id,
							userId: input.userId,
							source,
						},
						{ database },
					),
				),
			"SCIM role mapping failed",
		);
		for (const role of mappedRoles) {
			const roleExistenceKey = createScopedKey([
				"scim-role-existence",
				scimUser.connectionId,
				input.provisioningDomainId,
				role,
			]);
			let exists = roleExistenceByKey.get(roleExistenceKey);
			if (exists === undefined) {
				exists = await runSCIMApplicationCallback(
					() =>
						roleProjection.exists(
							{
								connectionId: scimUser.connectionId,
								provisioningDomainId: input.provisioningDomainId,
								role,
							},
							{ database },
						),
					"SCIM role validation failed",
				);
				roleExistenceByKey.set(roleExistenceKey, exists);
			}
			if (!exists) continue;
			const grantKey = createProjectionGrantKey({
				connectionId: scimUser.connectionId,
				scimUserId: scimUser.id,
				sourceKind: source.kind,
				sourceId: source.id,
				role,
			});
			desiredGrants.set(grantKey, {
				connectionId: scimUser.connectionId,
				provisioningDomainId: input.provisioningDomainId,
				scimUserId: scimUser.id,
				userId: input.userId,
				sourceKind: source.kind,
				sourceId: source.id,
				sourceValue: source.externalId ?? source.displayName,
				role,
				grantKey,
			});
		}
	}

	return [...desiredGrants.values()];
}

async function reconcileProjectionUserState(
	options: SCIMOptions,
	database: DBTransactionAdapter,
	input: {
		provisioningDomainId: string;
		userId: string;
		sourcesSCIMUsers: SCIMUser[];
		memberships?: readonly SCIMGroupMember[];
		groupById?: ReadonlyMap<string, SCIMGroup>;
		existingGrants?: readonly SCIMProjectionGrant[];
	},
): Promise<void> {
	const projection = options.projection;
	const activeSCIMUsers = input.sourcesSCIMUsers.filter(
		(scimUser) => scimUser.active,
	);
	const desiredGrants = await buildDesiredGrants(options, database, {
		provisioningDomainId: input.provisioningDomainId,
		userId: input.userId,
		activeSCIMUsers,
		memberships: input.memberships,
		groupById: input.groupById,
	});
	const existingGrants =
		input.existingGrants ??
		(await database.findMany<SCIMProjectionGrant>({
			model: "scimProjectionGrant",
			where: [
				{
					field: "provisioningDomainId",
					value: input.provisioningDomainId,
				},
				{ field: "userId", value: input.userId },
			],
		}));
	const desiredGrantByKey = new Map(
		desiredGrants.map((grant) => [grant.grantKey, grant]),
	);
	const existingGrantByKey = new Map(
		existingGrants.map((grant) => [grant.grantKey, grant]),
	);
	const removedGrantKeys = existingGrants
		.filter((grant) => !desiredGrantByKey.has(grant.grantKey))
		.map((grant) => grant.grantKey);
	if (removedGrantKeys.length > 0) {
		await database.deleteMany({
			model: "scimProjectionGrant",
			where: [
				{
					field: "provisioningDomainId",
					value: input.provisioningDomainId,
				},
				{ field: "userId", value: input.userId },
				{
					field: "grantKey",
					value: removedGrantKeys,
					operator: "in",
				},
			],
		});
	}

	const now = new Date();
	for (const desiredGrant of desiredGrants) {
		if (existingGrantByKey.has(desiredGrant.grantKey)) continue;
		await database.create<Omit<SCIMProjectionGrant, "id">, SCIMProjectionGrant>(
			{
				model: "scimProjectionGrant",
				data: {
					...desiredGrant,
					createdAt: now,
					updatedAt: now,
				},
			},
		);
	}
	if (!projection) return;

	const grants: SCIMProjectedRoleGrant[] = desiredGrants
		.map((grant) => ({
			key: grant.grantKey,
			sourceKind: grant.sourceKind,
			sourceId: grant.sourceId,
			role: grant.role,
		}))
		.sort((left, right) => left.key.localeCompare(right.key));
	const sources: SCIMIdentitySource[] = input.sourcesSCIMUsers
		.map((scimUser) => ({
			id: scimUser.id,
			connectionId: scimUser.connectionId,
			provisioningDomainId: scimUser.provisioningDomainId,
			active: scimUser.active,
		}))
		.sort((left, right) => left.id.localeCompare(right.id));
	await runSCIMApplicationCallback(
		() =>
			projection.reconcileUser(
				{
					provisioningDomainId: input.provisioningDomainId,
					userId: input.userId,
					active: activeSCIMUsers.length > 0,
					sources,
					grants,
				},
				{ database },
			),
		"SCIM projection reconciliation failed",
	);
}

async function reconcileSCIMUserBatch(
	options: SCIMOptions,
	input: {
		database: DBTransactionAdapter;
		auth: AuthContext;
		provisioningDomainId: string;
		scimUserIds: readonly string[];
	},
): Promise<void> {
	if (input.scimUserIds.length === 0) return;
	const subjects = await input.database.findMany<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "id", value: [...input.scimUserIds], operator: "in" },
			{
				field: "provisioningDomainId",
				value: input.provisioningDomainId,
			},
		],
	});
	const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
	const userIds: string[] = [];
	const seenUserIds = new Set<string>();
	for (const scimUserId of input.scimUserIds) {
		const userId = subjectById.get(scimUserId)?.userId;
		if (!userId || seenUserIds.has(userId)) continue;
		seenUserIds.add(userId);
		userIds.push(userId);
	}
	if (userIds.length === 0) return;

	const scimUsers = await input.database.findMany<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "userId", value: userIds, operator: "in" },
			{
				field: "provisioningDomainId",
				value: input.provisioningDomainId,
			},
		],
	});
	const connectionIds = [
		...new Set(scimUsers.map((scimUser) => scimUser.connectionId)),
	];
	const decommissionedConnectionIds = await findDecommissionedSCIMConnectionIds(
		input.database,
		connectionIds,
	);
	const sourcesSCIMUsers = scimUsers.filter(
		(scimUser) => !decommissionedConnectionIds.has(scimUser.connectionId),
	);
	const activeSCIMUserIds = sourcesSCIMUsers
		.filter((scimUser) => scimUser.active)
		.map((scimUser) => scimUser.id);
	const memberships =
		options.projection?.roles && activeSCIMUserIds.length > 0
			? await input.database.findMany<SCIMGroupMember>({
					model: "scimGroupMember",
					where: [
						{
							field: "scimUserId",
							value: activeSCIMUserIds,
							operator: "in",
						},
					],
				})
			: [];
	const groupIds = [
		...new Set(memberships.map((membership) => membership.groupId)),
	];
	const groups =
		groupIds.length === 0
			? []
			: await input.database.findMany<SCIMGroup>({
					model: "scimGroup",
					where: [{ field: "id", value: groupIds, operator: "in" }],
				});
	const existingGrants = await input.database.findMany<SCIMProjectionGrant>({
		model: "scimProjectionGrant",
		where: [
			{
				field: "provisioningDomainId",
				value: input.provisioningDomainId,
			},
			{ field: "userId", value: userIds, operator: "in" },
		],
	});

	const scimUsersByUserId = new Map<string, SCIMUser[]>();
	for (const scimUser of scimUsers) {
		const userSCIMUsers = scimUsersByUserId.get(scimUser.userId) ?? [];
		userSCIMUsers.push(scimUser);
		scimUsersByUserId.set(scimUser.userId, userSCIMUsers);
	}
	const membershipsBySCIMUserId = new Map<string, SCIMGroupMember[]>();
	for (const membership of memberships) {
		const userMemberships =
			membershipsBySCIMUserId.get(membership.scimUserId) ?? [];
		userMemberships.push(membership);
		membershipsBySCIMUserId.set(membership.scimUserId, userMemberships);
	}
	const existingGrantsByUserId = new Map<string, SCIMProjectionGrant[]>();
	for (const grant of existingGrants) {
		const userGrants = existingGrantsByUserId.get(grant.userId) ?? [];
		userGrants.push(grant);
		existingGrantsByUserId.set(grant.userId, userGrants);
	}
	const groupById = new Map(groups.map((group) => [group.id, group]));

	for (const userId of userIds) {
		const userSCIMUsers = scimUsersByUserId.get(userId) ?? [];
		const userSources = userSCIMUsers.filter(
			(scimUser) => !decommissionedConnectionIds.has(scimUser.connectionId),
		);
		const userMemberships = userSources
			.filter((scimUser) => scimUser.active)
			.flatMap((scimUser) => membershipsBySCIMUserId.get(scimUser.id) ?? []);
		await reconcileProjectionUserState(options, input.database, {
			provisioningDomainId: input.provisioningDomainId,
			userId,
			sourcesSCIMUsers: userSources,
			memberships: userMemberships,
			groupById,
			existingGrants: existingGrantsByUserId.get(userId) ?? [],
		});
	}
}

/** Creates the transaction-bound projection orchestrator for one plugin. */
export function createSCIMProjectionCoordinator(options: SCIMOptions) {
	return {
		async acquireUserLocks(input: {
			database: DBTransactionAdapter;
			provisioningDomainId: string;
			scimUserIds: readonly string[];
		}) {
			const scimUserIds = [...new Set(input.scimUserIds)];
			if (scimUserIds.length === 0) return;
			await acquireProjectionSubjectLocks(
				input.database,
				input.provisioningDomainId,
				scimUserIds,
			);
		},
		async reconcileUser(input: {
			database: DBTransactionAdapter;
			auth: AuthContext;
			provisioningDomainId?: string;
			scimUserId: string;
			userId?: string;
		}) {
			const subject = input.userId
				? {
						id: input.scimUserId,
						userId: input.userId,
						provisioningDomainId: input.provisioningDomainId,
					}
				: await input.database.findOne<
						Pick<SCIMUser, "id" | "provisioningDomainId" | "userId">
					>({
						model: "scimUser",
						where: [{ field: "id", value: input.scimUserId }],
					});
			if (!subject) return;

			const provisioningDomainId = subject.provisioningDomainId;
			if (!provisioningDomainId) return;
			const scimUsers = await input.database.findMany<SCIMUser>({
				model: "scimUser",
				where: [
					{ field: "userId", value: subject.userId },
					{ field: "provisioningDomainId", value: provisioningDomainId },
				],
			});
			const connectionIds = [
				...new Set(scimUsers.map((scimUser) => scimUser.connectionId)),
			];
			const decommissionedConnectionIds =
				await findDecommissionedSCIMConnectionIds(
					input.database,
					connectionIds,
				);
			const sourcesSCIMUsers = scimUsers.filter(
				(scimUser) => !decommissionedConnectionIds.has(scimUser.connectionId),
			);
			await reconcileProjectionUserState(options, input.database, {
				provisioningDomainId,
				userId: subject.userId,
				sourcesSCIMUsers,
			});
		},
		async reconcileUsers(input: {
			database: DBTransactionAdapter;
			auth: AuthContext;
			provisioningDomainId: string;
			scimUserIds: readonly string[];
			subjectLocksAcquired?: boolean;
		}) {
			const scimUserIds = [...new Set(input.scimUserIds)];
			if (scimUserIds.length === 0) return;
			if (!input.subjectLocksAcquired) {
				await acquireProjectionSubjectLocks(
					input.database,
					input.provisioningDomainId,
					scimUserIds,
				);
			}
			for (
				let offset = 0;
				offset < scimUserIds.length;
				offset += SCIM_PROJECTION_BATCH_SIZE
			) {
				await reconcileSCIMUserBatch(options, {
					...input,
					scimUserIds: scimUserIds.slice(
						offset,
						offset + SCIM_PROJECTION_BATCH_SIZE,
					),
				});
			}
		},
	};
}

function requireConfiguredProjection(options: SCIMOptions): void {
	if (options.projection) return;
	throw new BetterAuthError(
		"SCIM projection reconciliation requires projection.reconcileUser to be configured.",
	);
}

type SCIMProjectionDomainBatch = {
	scimUserIds: string[];
	userIds: string[];
	cursorUserId: string;
	hasMore: boolean;
};

async function findProjectionDomainBatch(input: {
	database: Pick<DBAdapter, "findMany">;
	provisioningDomainId: string;
	cursorUserId?: string | null;
}): Promise<SCIMProjectionDomainBatch | null> {
	const candidates = await input.database.findMany<
		Pick<SCIMUser, "id" | "userId">
	>({
		model: "scimUser",
		where: [
			{
				field: "provisioningDomainId",
				value: input.provisioningDomainId,
			},
			...(input.cursorUserId
				? [
						{
							field: "userId",
							value: input.cursorUserId,
							operator: "gt" as const,
						},
					]
				: []),
		],
		limit: SCIM_PROJECTION_BATCH_SIZE + 1,
		sortBy: { field: "userId", direction: "asc" },
	});
	if (candidates.length === 0) return null;

	const rows = candidates.slice(0, SCIM_PROJECTION_BATCH_SIZE);
	const subjectByUserId = new Map(
		rows.map((scimUser) => [scimUser.userId, scimUser]),
	);
	const cursorUserId = rows.at(-1)?.userId;
	if (!cursorUserId) return null;

	return {
		scimUserIds: [...subjectByUserId.values()].map((subject) => subject.id),
		userIds: [...subjectByUserId.keys()],
		cursorUserId,
		hasMore: candidates.length > SCIM_PROJECTION_BATCH_SIZE,
	};
}

async function reconcileProjectionDomainBatch(input: {
	database: DBTransactionAdapter;
	auth: AuthContext;
	projection: SCIMProjectionCoordinator;
	identity?: SCIMIdentityCoordinator;
	provisioningDomainId: string;
	batch: SCIMProjectionDomainBatch;
}): Promise<void> {
	await input.projection.reconcileUsers({
		database: input.database,
		auth: input.auth,
		provisioningDomainId: input.provisioningDomainId,
		scimUserIds: input.batch.scimUserIds,
	});
	if (!input.identity) return;

	const subjects = await input.database.findMany<SCIMSubject>({
		model: "scimSubject",
		where: [
			{
				field: "userId",
				value: input.batch.userIds,
				operator: "in",
			},
		],
	});
	const aggregateByUserId = new Map(
		subjects.map((subject) => [subject.userId, subject]),
	);
	for (const userId of input.batch.userIds) {
		const subject = aggregateByUserId.get(userId);
		if (!subject) continue;
		await input.identity.reconcileUser({
			database: input.database,
			auth: input.auth,
			subject,
		});
	}
}

async function reconcileProjectionDomain(input: {
	database: DBAdapter;
	auth: AuthContext;
	projection: SCIMProjectionCoordinator;
	identity?: SCIMIdentityCoordinator;
	provisioningDomainId: string;
}) {
	let cursor: string | undefined;
	let reconciledUsers = 0;
	let batches = 0;

	while (true) {
		const batch = await findProjectionDomainBatch({
			database: input.database,
			provisioningDomainId: input.provisioningDomainId,
			cursorUserId: cursor,
		});
		if (!batch) break;
		await runWithTransaction(input.database, async () => {
			const trx = await getCurrentAdapter(input.database);
			await reconcileProjectionDomainBatch({
				database: trx,
				auth: input.auth,
				provisioningDomainId: input.provisioningDomainId,
				projection: input.projection,
				identity: input.identity,
				batch,
			});
		});

		batches++;
		reconciledUsers += batch.userIds.length;
		cursor = batch.cursorUserId;
		if (!batch.hasMore) break;
	}

	return {
		provisioningDomainId: input.provisioningDomainId,
		reconciledUsers,
		batches,
	};
}

function createDecommissionResult(binding: SCIMConnectionBinding) {
	if (binding.decommissionStatus === "active") {
		throw new BetterAuthError(
			`SCIM connection "${binding.connectionId}" has not started decommissioning.`,
		);
	}
	return {
		connectionId: binding.connectionId,
		provisioningDomainId: binding.provisioningDomainId,
		status: binding.decommissionStatus,
		decommissionedAt: binding.decommissionedAt ?? null,
		completedAt: binding.decommissionCompletedAt ?? null,
		retryAfter:
			binding.decommissionStatus === "reconciling"
				? (binding.decommissionLeaseExpiresAt ?? null)
				: null,
		reconciledUsers: binding.decommissionReconciledUserCount,
		batches: binding.decommissionBatchCount,
	};
}

async function findConnectionBinding(
	database: Pick<DBAdapter, "findOne">,
	connectionId: string,
): Promise<SCIMConnectionBinding> {
	const binding = await database.findOne<SCIMConnectionBinding>({
		model: "scimConnectionBinding",
		where: [
			{
				field: "connectionKey",
				value: createSCIMConnectionKey(connectionId),
			},
		],
	});
	if (binding) return binding;
	throw new BetterAuthError(
		`SCIM connection "${connectionId}" has no persisted binding.`,
	);
}

async function acquireDecommissionLease(
	database: DBAdapter,
	connectionId: string,
): Promise<{
	binding: SCIMConnectionBinding;
	leaseId?: string;
}> {
	const leaseId = generateId(32);
	for (let attempt = 0; attempt < 10; attempt++) {
		const binding = await findConnectionBinding(database, connectionId);
		if (binding.decommissionStatus === "complete") return { binding };

		const now = new Date();
		const activeLease =
			binding.decommissionStatus === "reconciling" &&
			binding.decommissionLeaseId &&
			binding.decommissionLeaseExpiresAt &&
			binding.decommissionLeaseExpiresAt.getTime() > now.getTime();
		if (activeLease) return { binding };

		const acquired = await database.incrementOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [
				{ field: "id", value: binding.id },
				{
					field: "decommissionRevision",
					value: binding.decommissionRevision,
				},
				{
					field: "decommissionStatus",
					value: binding.decommissionStatus,
				},
			],
			increment: { decommissionRevision: 1 },
			set: {
				decommissionStatus: "reconciling",
				decommissionedAt: binding.decommissionedAt ?? now,
				decommissionCompletedAt: null,
				decommissionLeaseId: leaseId,
				decommissionLeaseExpiresAt: new Date(
					now.getTime() + SCIM_DECOMMISSION_LEASE_DURATION_MS,
				),
			},
		});
		if (acquired) return { binding: acquired, leaseId };
	}

	throw new BetterAuthError(
		`SCIM connection "${connectionId}" changed repeatedly while decommissioning; retry the operation.`,
	);
}

async function releaseDecommissionLease(input: {
	database: DBAdapter;
	bindingId: string;
	leaseId: string;
}): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const binding = await input.database.findOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [{ field: "id", value: input.bindingId }],
		});
		if (
			!binding ||
			binding.decommissionStatus === "complete" ||
			binding.decommissionLeaseId !== input.leaseId
		) {
			return;
		}
		const released = await input.database.incrementOne<SCIMConnectionBinding>({
			model: "scimConnectionBinding",
			where: [
				{ field: "id", value: binding.id },
				{
					field: "decommissionRevision",
					value: binding.decommissionRevision,
				},
				{ field: "decommissionLeaseId", value: input.leaseId },
			],
			increment: { decommissionRevision: 1 },
			set: {
				decommissionLeaseId: null,
				decommissionLeaseExpiresAt: null,
			},
		});
		if (released) return;
	}
}

async function reconcileDecommissionedConnection(input: {
	database: DBAdapter;
	auth: AuthContext;
	projection: SCIMProjectionCoordinator;
	identity: SCIMIdentityCoordinator;
	binding: SCIMConnectionBinding;
	leaseId: string;
}): Promise<SCIMConnectionBinding> {
	try {
		while (true) {
			const checkpoint = await runWithTransaction(input.database, async () => {
				const trx = await getCurrentAdapter(input.database);
				const binding = await trx.findOne<SCIMConnectionBinding>({
					model: "scimConnectionBinding",
					where: [{ field: "id", value: input.binding.id }],
				});
				if (!binding) {
					throw new BetterAuthError(
						`SCIM connection "${input.binding.connectionId}" binding disappeared during decommissioning.`,
					);
				}
				if (binding.decommissionStatus === "complete") return binding;
				if (binding.decommissionLeaseId !== input.leaseId) {
					throw new BetterAuthError(
						`SCIM connection "${binding.connectionId}" decommission lease was taken over by another worker.`,
					);
				}

				const batch = await findProjectionDomainBatch({
					database: trx,
					provisioningDomainId: binding.provisioningDomainId,
					cursorUserId: binding.decommissionCursorUserId,
				});
				if (!batch) {
					const completed = await trx.incrementOne<SCIMConnectionBinding>({
						model: "scimConnectionBinding",
						where: [
							{ field: "id", value: binding.id },
							{
								field: "decommissionRevision",
								value: binding.decommissionRevision,
							},
							{ field: "decommissionLeaseId", value: input.leaseId },
						],
						increment: { decommissionRevision: 1 },
						set: {
							decommissionStatus: "complete",
							decommissionCompletedAt: new Date(),
							decommissionLeaseId: null,
							decommissionLeaseExpiresAt: null,
						},
					});
					if (completed) return completed;
					throw new BetterAuthError(
						`SCIM connection "${binding.connectionId}" decommission checkpoint changed concurrently.`,
					);
				}

				await reconcileProjectionDomainBatch({
					database: trx,
					auth: input.auth,
					projection: input.projection,
					identity: input.identity,
					provisioningDomainId: binding.provisioningDomainId,
					batch,
				});
				const now = new Date();
				const set: Partial<SCIMConnectionBinding> = {
					decommissionCursorUserId: batch.cursorUserId,
					...(batch.hasMore
						? {
								decommissionLeaseExpiresAt: new Date(
									now.getTime() + SCIM_DECOMMISSION_LEASE_DURATION_MS,
								),
							}
						: {
								decommissionStatus: "complete" as const,
								decommissionCompletedAt: now,
								decommissionLeaseId: null,
								decommissionLeaseExpiresAt: null,
							}),
				};
				const advanced = await trx.incrementOne<SCIMConnectionBinding>({
					model: "scimConnectionBinding",
					where: [
						{ field: "id", value: binding.id },
						{
							field: "decommissionRevision",
							value: binding.decommissionRevision,
						},
						{ field: "decommissionLeaseId", value: input.leaseId },
					],
					increment: {
						decommissionRevision: 1,
						decommissionReconciledUserCount: batch.userIds.length,
						decommissionBatchCount: 1,
					},
					set,
				});
				if (advanced) return advanced;
				throw new BetterAuthError(
					`SCIM connection "${binding.connectionId}" decommission checkpoint changed concurrently.`,
				);
			});
			if (checkpoint.decommissionStatus === "complete") return checkpoint;
		}
	} catch (error) {
		try {
			await releaseDecommissionLease({
				database: input.database,
				bindingId: input.binding.id,
				leaseId: input.leaseId,
			});
		} catch {
			// Preserve the operation error. An unreleased lease remains recoverable
			// through its persisted expiry.
		}
		throw error;
	}
}

/** Creates the trusted server API for replaying one provisioning domain. */
export function createReconcileSCIMProjectionEndpoint(
	options: SCIMOptions,
	projection: SCIMProjectionCoordinator,
) {
	return createAuthEndpoint.serverOnly(
		{
			method: "POST",
			body: reconcileProjectionBodySchema,
		},
		async (ctx) => {
			requireConfiguredProjection(options);
			assertNativeSCIMTransactions(ctx.context.adapter);
			const result = await reconcileProjectionDomain({
				database: ctx.context.adapter,
				auth: ctx.context,
				projection,
				provisioningDomainId: ctx.body.provisioningDomainId,
			});
			return ctx.json(result);
		},
	);
}

/** Creates the trusted server API for permanently retiring one connection. */
export function createDecommissionSCIMConnectionEndpoint(
	projection: SCIMProjectionCoordinator,
	identity: SCIMIdentityCoordinator,
) {
	return createAuthEndpoint.serverOnly(
		{
			method: "POST",
			body: decommissionConnectionBodySchema,
		},
		async (ctx) => {
			assertNativeSCIMTransactions(ctx.context.adapter);
			const acquired = await acquireDecommissionLease(
				ctx.context.adapter,
				ctx.body.connectionId,
			);
			if (!acquired.leaseId) {
				return ctx.json(createDecommissionResult(acquired.binding));
			}
			const binding = await reconcileDecommissionedConnection({
				database: ctx.context.adapter,
				auth: ctx.context,
				projection,
				identity,
				binding: acquired.binding,
				leaseId: acquired.leaseId,
			});
			return ctx.json(createDecommissionResult(binding));
		},
	);
}
