import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import type { AuthContext, DBAdapter, DBTransactionAdapter } from "better-auth";
import type {
	SCIMIdentityResolution,
	SCIMIdentityResolutionInput,
	SCIMIdentitySource,
	SCIMIdentityState,
	SCIMOptions,
} from "./configuration";
import { findDecommissionedSCIMConnectionIds } from "./connection-state";
import type {
	SCIMIdentityTombstone,
	SCIMSubject,
	SCIMUser,
} from "./persistence";
import { createScopedKey } from "./resource-key";
import { createSCIMError, runSCIMApplicationCallback } from "./scim-error";

export type SCIMIdentityCoordinator = ReturnType<
	typeof createSCIMIdentityCoordinator
>;

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
				const externalIdKey = createScopedKey([
					"scim-user-external-id",
					input.connectionId,
					input.resource.externalId,
				]);
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
			const state: SCIMIdentityState = {
				userId: input.subject.userId,
				active: sources.some((source) => source.active),
				...(subject.profileSourceId
					? { profileSourceId: subject.profileSourceId }
					: {}),
				sources,
			};
			await runSCIMApplicationCallback(
				() =>
					options.identity?.reconcileUser?.(state, {
						database: input.database,
					}),
				"SCIM identity reconciliation failed",
			);
			if (!state.active) {
				await input.auth.internalAdapter.deleteUserSessions(state.userId);
			}
			return state;
		},
	};
}
