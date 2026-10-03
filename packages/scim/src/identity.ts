import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type {
	AuthContext,
	DBAdapter,
	DBTransactionAdapter,
	User,
} from "better-auth";
import type {
	SCIMIdentityResolution,
	SCIMIdentityResolutionInput,
	SCIMIdentitySource,
	SCIMIdentityState,
	SCIMOptions,
} from "./configuration";
import {
	createSCIMConnectionKey,
	findDecommissionedSCIMConnectionIds,
	tryFenceActiveSCIMConnection,
} from "./connection-state";
import type {
	SCIMConnectionBinding,
	SCIMIdentityTombstone,
	SCIMSubject,
	SCIMUser,
} from "./persistence";
import { createSCIMUserExternalIdKey } from "./resource-key";
import { createSCIMError, runSCIMApplicationCallback } from "./scim-error";

export type SCIMIdentityCoordinator = ReturnType<
	typeof createSCIMIdentityCoordinator
>;

/** Exact external directory reference for one connection-owned SCIM User. */
export interface SCIMUserExternalIdReference {
	connectionId: string;
	externalId: string;
}

/** Exact Better Auth User link acquired from an active SCIM source. */
export interface SCIMActiveUserLink {
	scimUserId: string;
	userId: string;
}

/** Transaction-bound database capabilities required to acquire an active link. */
export interface SCIMActiveUserLinkContext {
	database: Pick<DBTransactionAdapter, "findOne" | "incrementOne">;
}

/**
 * Acquires an active provisioned User link inside the caller's transaction.
 *
 * The lookup is scoped to the exact SCIM connection and externalId. It never
 * falls back to userName, email, or deleted identity tombstones. Pass the
 * active transaction adapter supplied by the authentication resolver. A
 * concurrent lifecycle mutation throws a SCIM conflict. A direct caller can
 * choose to retry its entire transaction after starting from fresh state.
 */
export async function acquireActiveSCIMUserLink(
	reference: SCIMUserExternalIdReference,
	context: SCIMActiveUserLinkContext,
): Promise<SCIMActiveUserLink | null> {
	const externalIdKey = createSCIMUserExternalIdKey(
		reference.connectionId,
		reference.externalId,
	);
	const source = await context.database.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "connectionId", value: reference.connectionId },
			{ field: "externalIdKey", value: externalIdKey },
			{ field: "externalId", value: reference.externalId },
			{ field: "active", value: true },
		],
	});
	if (!source) return null;
	const binding = await context.database.findOne<SCIMConnectionBinding>({
		model: "scimConnectionBinding",
		where: [
			{
				field: "connectionKey",
				value: createSCIMConnectionKey(reference.connectionId),
			},
			{ field: "connectionId", value: reference.connectionId },
			{ field: "decommissionStatus", value: "active" },
		],
	});
	if (
		!binding ||
		binding.provisioningDomainId !== source.provisioningDomainId
	) {
		return null;
	}
	const tombstone = await context.database.findOne<SCIMIdentityTombstone>({
		model: "scimIdentityTombstone",
		where: [
			{ field: "connectionId", value: reference.connectionId },
			{ field: "externalIdKey", value: externalIdKey },
			{ field: "externalId", value: reference.externalId },
		],
	});
	if (tombstone) return null;
	const subject = await context.database.findOne<SCIMSubject>({
		model: "scimSubject",
		where: [{ field: "userId", value: source.userId }],
	});
	if (!subject) return null;
	const user = await context.database.findOne<User>({
		model: "user",
		where: [{ field: "id", value: source.userId }],
	});
	if (!user) return null;
	const acquiredSubject = await context.database.incrementOne<SCIMSubject>({
		model: "scimSubject",
		where: [
			{ field: "id", value: subject.id },
			{ field: "userId", value: source.userId },
			{ field: "revision", value: subject.revision },
		],
		increment: { revision: 1 },
		set: { updatedAt: new Date() },
	});
	if (!acquiredSubject) concurrentIdentityMutation();
	const acquiredSource = await context.database.findOne<SCIMUser>({
		model: "scimUser",
		where: [
			{ field: "id", value: source.id },
			{ field: "connectionId", value: reference.connectionId },
			{ field: "provisioningDomainId", value: binding.provisioningDomainId },
			{ field: "userId", value: source.userId },
			{ field: "connectionUserKey", value: source.connectionUserKey },
			{ field: "externalIdKey", value: externalIdKey },
			{ field: "externalId", value: reference.externalId },
			{ field: "active", value: true },
		],
	});
	if (
		!acquiredSource ||
		!acquiredSource.active ||
		acquiredSource.userId !== acquiredSubject.userId
	) {
		concurrentIdentityMutation();
	}
	const acquiredUser = await context.database.findOne<User>({
		model: "user",
		where: [{ field: "id", value: acquiredSource.userId }],
	});
	if (!acquiredUser) concurrentIdentityMutation();
	const acquiredTombstone =
		await context.database.findOne<SCIMIdentityTombstone>({
			model: "scimIdentityTombstone",
			where: [
				{ field: "connectionId", value: reference.connectionId },
				{ field: "externalIdKey", value: externalIdKey },
				{ field: "externalId", value: reference.externalId },
			],
		});
	if (acquiredTombstone) concurrentIdentityMutation();
	const acquiredBinding = await tryFenceActiveSCIMConnection(
		context.database,
		reference.connectionId,
	);
	if (
		!acquiredBinding ||
		acquiredBinding.id !== binding.id ||
		acquiredBinding.provisioningDomainId !== acquiredSource.provisioningDomainId
	) {
		concurrentIdentityMutation();
	}
	return { scimUserId: source.id, userId: source.userId };
}

const SCIM_IDENTITY_MUTATION_CONFLICT = Symbol(
	"scim-identity-mutation-conflict",
);
const SCIM_IDENTITY_TRANSACTION_ATTEMPTS = 3;

type SCIMIdentityMutationConflict = ReturnType<typeof createSCIMError> & {
	[SCIM_IDENTITY_MUTATION_CONFLICT]: true;
};

interface IdentityMutationTransactionOptions {
	subjectCreationUserId?: string;
}

function concurrentIdentityMutation(): never {
	const error = createSCIMError("CONFLICT", {
		detail: "The SCIM identity changed concurrently; retry the request",
	}) as SCIMIdentityMutationConflict;
	error[SCIM_IDENTITY_MUTATION_CONFLICT] = true;
	throw error;
}

export function isSCIMIdentityMutationConflict(
	error: unknown,
): error is SCIMIdentityMutationConflict {
	return (
		typeof error === "object" &&
		error !== null &&
		SCIM_IDENTITY_MUTATION_CONFLICT in error
	);
}

export async function runIdentityMutationTransaction<Result>(
	adapter: DBAdapter,
	callback: (transaction: DBTransactionAdapter) => Promise<Result>,
	options: IdentityMutationTransactionOptions = {},
): Promise<Result> {
	let subjectCreationObserved = options.subjectCreationUserId
		? Boolean(
				await adapter.findOne<SCIMSubject>({
					model: "scimSubject",
					where: [{ field: "userId", value: options.subjectCreationUserId }],
				}),
			)
		: false;
	for (
		let attempt = 1;
		attempt <= SCIM_IDENTITY_TRANSACTION_ATTEMPTS;
		attempt++
	) {
		try {
			return await runWithTransaction(adapter, async () =>
				callback(await getCurrentAdapter(adapter)),
			);
		} catch (error) {
			if (isSCIMIdentityMutationConflict(error)) continue;
			if (!options.subjectCreationUserId || subjectCreationObserved)
				throw error;
			const concurrentlyCreatedSubject = await adapter.findOne<SCIMSubject>({
				model: "scimSubject",
				where: [{ field: "userId", value: options.subjectCreationUserId }],
			});
			if (!concurrentlyCreatedSubject) throw error;
			subjectCreationObserved = true;
		}
	}

	throw createSCIMError("CONFLICT", {
		detail: "The SCIM identity changed concurrently; retry the request",
	});
}

async function advanceSubjectRevision(
	database: DBTransactionAdapter,
	subject: SCIMSubject,
	now: Date,
): Promise<SCIMSubject> {
	const updated = await database.incrementOne<SCIMSubject>({
		model: "scimSubject",
		where: [
			{ field: "id", value: subject.id },
			{ field: "revision", value: subject.revision },
		],
		increment: { revision: 1 },
		set: { updatedAt: now },
	});
	return updated ?? concurrentIdentityMutation();
}

async function clearProfileSource(
	database: DBTransactionAdapter,
	subject: SCIMSubject,
	scimUserId: string,
	now: Date,
): Promise<SCIMSubject> {
	if (subject.profileSourceId !== scimUserId) return subject;
	const updated = await database.incrementOne<SCIMSubject>({
		model: "scimSubject",
		where: [
			{ field: "id", value: subject.id },
			{ field: "revision", value: subject.revision },
			{ field: "profileSourceId", value: scimUserId },
		],
		increment: { revision: 1 },
		set: { profileSourceId: null, updatedAt: now },
	});
	return updated ?? concurrentIdentityMutation();
}

/** Create the user-level identity coordinator for one plugin instance. */
export function createSCIMIdentityCoordinator(options: SCIMOptions) {
	return {
		async resolveUser(
			input: SCIMIdentityResolutionInput,
			context: { database: DBAdapter },
		): Promise<{
			resolution: SCIMIdentityResolution;
			tombstoneId?: string;
		}> {
			if (input.resource.externalId) {
				const externalIdKey = createSCIMUserExternalIdKey(
					input.connectionId,
					input.resource.externalId,
				);
				const tombstone = await context.database.findOne<SCIMIdentityTombstone>(
					{
						model: "scimIdentityTombstone",
						where: [
							{ field: "connectionId", value: input.connectionId },
							{ field: "externalIdKey", value: externalIdKey },
						],
					},
				);
				if (tombstone) {
					if (tombstone.provisioningDomainId !== input.provisioningDomainId) {
						throw createSCIMError("CONFLICT", {
							detail:
								"The connection provisioningDomainId changed after this User was deleted",
						});
					}
					return {
						resolution: {
							action: "link",
							userId: tombstone.userId,
							profile: tombstone.profile,
						},
						tombstoneId: tombstone.id,
					};
				}
			}

			return {
				resolution: (await runSCIMApplicationCallback(
					() => options.identity?.resolveUser?.(input, context),
					"SCIM identity resolution failed",
				)) ?? { action: "create" },
			};
		},

		async consumeTombstone(
			database: DBTransactionAdapter,
			tombstoneId?: string,
		): Promise<void> {
			if (!tombstoneId) return;
			await database.delete<SCIMIdentityTombstone>({
				model: "scimIdentityTombstone",
				where: [{ field: "id", value: tombstoneId }],
			});
		},

		async preserveDeletedSource(
			database: DBTransactionAdapter,
			input: {
				source: SCIMUser;
				subject: SCIMSubject;
				deletedAt: Date;
			},
		): Promise<void> {
			if (!input.source.externalId || !input.source.externalIdKey) return;
			const profile =
				input.subject.profileSourceId === input.source.id
					? "manage"
					: "preserve";
			const existing = await database.findOne<SCIMIdentityTombstone>({
				model: "scimIdentityTombstone",
				where: [
					{
						field: "externalIdKey",
						value: input.source.externalIdKey,
					},
				],
			});
			if (existing) {
				await database.update<SCIMIdentityTombstone>({
					model: "scimIdentityTombstone",
					where: [{ field: "id", value: existing.id }],
					update: {
						userId: input.source.userId,
						profile,
						deletedAt: input.deletedAt,
					},
				});
				return;
			}
			await database.create<
				Omit<SCIMIdentityTombstone, "id">,
				SCIMIdentityTombstone
			>({
				model: "scimIdentityTombstone",
				data: {
					connectionId: input.source.connectionId,
					provisioningDomainId: input.source.provisioningDomainId,
					externalId: input.source.externalId,
					externalIdKey: input.source.externalIdKey,
					userId: input.source.userId,
					profile,
					deletedAt: input.deletedAt,
				},
			});
		},

		async acquireSubject(
			database: DBTransactionAdapter,
			userId: string,
			now: Date,
		): Promise<SCIMSubject> {
			const existing = await database.findOne<SCIMSubject>({
				model: "scimSubject",
				where: [{ field: "userId", value: userId }],
			});
			if (!existing) {
				return database.create<Omit<SCIMSubject, "id">, SCIMSubject>({
					model: "scimSubject",
					data: {
						userId,
						profileSourceId: null,
						revision: 1,
						createdAt: now,
						updatedAt: now,
					},
				});
			}

			return advanceSubjectRevision(database, existing, now);
		},

		async acquireSubjectRevision(
			database: DBTransactionAdapter,
			subject: SCIMSubject,
			now: Date,
		): Promise<SCIMSubject> {
			return advanceSubjectRevision(database, subject, now);
		},

		async claimProfileSource(
			database: DBTransactionAdapter,
			subject: SCIMSubject,
			scimUserId: string,
			now: Date,
		): Promise<SCIMSubject> {
			if (subject.profileSourceId && subject.profileSourceId !== scimUserId) {
				throw createSCIMError("CONFLICT", {
					detail: "Another SCIM source already manages this User profile",
					scimType: "uniqueness",
				});
			}
			const updated = await database.incrementOne<SCIMSubject>({
				model: "scimSubject",
				where: [
					{ field: "id", value: subject.id },
					{ field: "revision", value: subject.revision },
					{ field: "profileSourceId", value: null },
				],
				increment: { revision: 1 },
				set: { profileSourceId: scimUserId, updatedAt: now },
			});
			return updated ?? concurrentIdentityMutation();
		},

		async clearProfileSource(
			database: DBTransactionAdapter,
			subject: SCIMSubject,
			scimUserId: string,
			now: Date,
		): Promise<SCIMSubject> {
			return clearProfileSource(database, subject, scimUserId, now);
		},

		async reconcileUser(input: {
			database: DBTransactionAdapter;
			auth: AuthContext;
			subject: SCIMSubject;
		}): Promise<SCIMIdentityState> {
			const scimUsers = await input.database.findMany<SCIMUser>({
				model: "scimUser",
				where: [{ field: "userId", value: input.subject.userId }],
			});
			const connectionIds = [
				...new Set(scimUsers.map((scimUser) => scimUser.connectionId)),
			];
			const decommissionedConnectionIds =
				await findDecommissionedSCIMConnectionIds(
					input.database,
					connectionIds,
				);
			const participatingSCIMUsers = scimUsers.filter(
				(scimUser) => !decommissionedConnectionIds.has(scimUser.connectionId),
			);
			let subject = input.subject;
			if (
				subject.profileSourceId &&
				!participatingSCIMUsers.some(
					(source) => source.id === subject.profileSourceId,
				)
			) {
				subject = await clearProfileSource(
					input.database,
					subject,
					subject.profileSourceId,
					new Date(),
				);
			}
			const sources: SCIMIdentitySource[] = participatingSCIMUsers
				.map((scimUser) => ({
					id: scimUser.id,
					connectionId: scimUser.connectionId,
					provisioningDomainId: scimUser.provisioningDomainId,
					active: scimUser.active,
				}))
				.sort((left, right) => left.id.localeCompare(right.id));
			const userId = input.subject.userId;
			const active = sources.some((source) => source.active);
			const state: SCIMIdentityState = {
				userId,
				active,
				...(subject.profileSourceId
					? { profileSourceId: subject.profileSourceId }
					: {}),
				sources: sources.map((source) => ({ ...source })),
			};
			await runSCIMApplicationCallback(
				() =>
					options.identity?.reconcileUser?.(state, {
						database: input.database,
					}),
				"SCIM identity reconciliation failed",
			);
			if (!active) {
				await input.auth.internalAdapter.deleteUserSessions(userId);
			}
			return {
				userId,
				active,
				...(subject.profileSourceId
					? { profileSourceId: subject.profileSourceId }
					: {}),
				sources,
			};
		},
	};
}
