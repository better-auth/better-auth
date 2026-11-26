import {
	getCurrentAdapter,
	runWithTransaction,
} from "@better-auth/core/context";
import { BetterAuthError } from "@better-auth/core/error";
import type { DBAdapter, DBTransactionAdapter } from "better-auth";
import type { SCIMConnection } from "./configuration";
import { isSCIMIdentityMutationConflict } from "./identity";
import type { SCIMGroup } from "./persistence";
import { chunkSCIMIds } from "./persistence";
import { isSCIMProjectionSubjectConflict } from "./projection";
import { createSCIMError } from "./scim-error";

const SCIM_GROUP_TRANSACTION_ATTEMPTS = 3;
const SCIM_GROUP_MUTATION_CONFLICT = Symbol("scim-group-mutation-conflict");

type SCIMGroupMutationConflict = BetterAuthError & {
	[SCIM_GROUP_MUTATION_CONFLICT]: true;
};

export function throwConcurrentSCIMGroupMutation(): never {
	const error = new BetterAuthError(
		"The SCIM Group changed concurrently; retry the request.",
	) as SCIMGroupMutationConflict;
	error[SCIM_GROUP_MUTATION_CONFLICT] = true;
	throw error;
}

function isSCIMGroupMutationConflict(
	error: unknown,
): error is SCIMGroupMutationConflict {
	return (
		error instanceof BetterAuthError && SCIM_GROUP_MUTATION_CONFLICT in error
	);
}

export async function runGroupMutationTransaction<Result>(
	adapter: DBAdapter,
	callback: (transaction: DBTransactionAdapter) => Promise<Result>,
): Promise<Result> {
	for (let attempt = 1; attempt <= SCIM_GROUP_TRANSACTION_ATTEMPTS; attempt++) {
		try {
			return await runWithTransaction(adapter, async () =>
				callback(await getCurrentAdapter(adapter)),
			);
		} catch (error) {
			if (
				!isSCIMIdentityMutationConflict(error) &&
				!isSCIMProjectionSubjectConflict(error) &&
				!isSCIMGroupMutationConflict(error)
			) {
				throw error;
			}
		}
	}

	throw createSCIMError("CONFLICT", {
		detail: "The SCIM Group changed concurrently; retry the request",
	});
}

export async function findSCIMGroup(
	adapter: Pick<DBAdapter, "findOne">,
	connection: SCIMConnection,
	groupId: string,
): Promise<SCIMGroup | null> {
	const group = await adapter.findOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "id", value: groupId },
			{ field: "connectionId", value: connection.id },
		],
	});
	if (group && group.provisioningDomainId !== connection.provisioningDomainId) {
		throw createSCIMError("CONFLICT", {
			detail:
				"The connection provisioningDomainId changed after resources were created",
		});
	}
	return group;
}

export async function acquireSCIMGroupMutationLock(
	database: DBTransactionAdapter,
	connection: SCIMConnection,
	groupId: string,
	missingGroup: "not-found" | "conflict" = "not-found",
): Promise<SCIMGroup> {
	const group = await findSCIMGroup(database, connection, groupId);
	if (!group) {
		if (missingGroup === "conflict") throwConcurrentSCIMGroupMutation();
		throw createSCIMError("NOT_FOUND", {
			detail: "SCIM Group not found",
		});
	}
	const lockedGroup = await database.incrementOne<SCIMGroup>({
		model: "scimGroup",
		where: [
			{ field: "id", value: group.id },
			{ field: "connectionId", value: connection.id },
			{ field: "revision", value: group.revision },
		],
		increment: { revision: 1 },
	});
	if (!lockedGroup) throwConcurrentSCIMGroupMutation();
	return lockedGroup;
}

export async function acquireSCIMGroupMutationLocks(
	database: DBTransactionAdapter,
	connection: SCIMConnection,
	groupIds: readonly string[],
): Promise<SCIMGroup[]> {
	const uniqueGroupIds = [...new Set(groupIds)].sort();
	if (uniqueGroupIds.length === 0) return [];

	const foundGroups: SCIMGroup[] = [];
	for (const chunk of chunkSCIMIds(uniqueGroupIds)) {
		foundGroups.push(
			...(await database.findMany<SCIMGroup>({
				model: "scimGroup",
				where: [
					{ field: "id", value: chunk, operator: "in" },
					{ field: "connectionId", value: connection.id },
				],
				limit: chunk.length,
			})),
		);
	}
	const groupById = new Map(foundGroups.map((group) => [group.id, group]));
	const groups = uniqueGroupIds.map((groupId) => {
		const group = groupById.get(groupId);
		if (!group) throwConcurrentSCIMGroupMutation();
		if (group.provisioningDomainId !== connection.provisioningDomainId) {
			throw createSCIMError("CONFLICT", {
				detail:
					"The connection provisioningDomainId changed after resources were created",
			});
		}
		return group;
	});

	const lockedGroups = await database.incrementMany<SCIMGroup>({
		model: "scimGroup",
		increment: { revision: 1 },
		rows: groups.map((group) => ({
			where: [
				{ field: "id", value: group.id },
				{ field: "connectionId", value: connection.id },
				{ field: "revision", value: group.revision },
			],
		})),
	});
	if (lockedGroups.length !== groups.length) {
		throwConcurrentSCIMGroupMutation();
	}
	return lockedGroups;
}

export async function markSCIMGroupsModified(
	database: DBTransactionAdapter,
	connectionId: string,
	groups: readonly SCIMGroup[],
	updatedAt: Date,
): Promise<void> {
	if (groups.length === 0) return;
	const updatedGroups = await database.incrementMany<SCIMGroup>({
		model: "scimGroup",
		increment: {},
		set: { updatedAt },
		rows: groups.map((group) => ({
			where: [
				{ field: "id", value: group.id },
				{ field: "connectionId", value: connectionId },
				{ field: "revision", value: group.revision },
			],
		})),
	});
	if (updatedGroups.length !== groups.length) {
		throwConcurrentSCIMGroupMutation();
	}
}
