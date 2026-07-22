import type { DBAdapter, DBTransactionAdapter } from "better-auth";
import type { SCIMConnectionBinding } from "./persistence";
import { createScopedKey } from "./resource-key";
import { createSCIMError } from "./scim-error";

/** Creates the stable lookup key for a code-defined connection id. */
export function createSCIMConnectionKey(connectionId: string): string {
	return createScopedKey(["scim-connection", connectionId]);
}

/** Finds connections that no longer participate in lifecycle or access state. */
export async function findDecommissionedSCIMConnectionIds(
	database: Pick<DBAdapter, "findMany">,
	connectionIds: readonly string[],
): Promise<Set<string>> {
	if (connectionIds.length === 0) return new Set();
	const bindings = await database.findMany<SCIMConnectionBinding>({
		model: "scimConnectionBinding",
		where: [
			{
				field: "connectionId",
				value: [...new Set(connectionIds)],
				operator: "in",
			},
		],
	});
	return new Set(
		bindings
			.filter((binding) => binding.decommissionStatus !== "active")
			.map((binding) => binding.connectionId),
	);
}

/**
 * Fence a completed resource mutation against concurrent connection
 * retirement. The atomic update orders decommission after this transaction,
 * or fails the transaction when retirement won the race.
 */
export async function fenceActiveSCIMConnection(
	database: Pick<DBTransactionAdapter, "incrementOne">,
	connectionId: string,
): Promise<SCIMConnectionBinding> {
	const binding = await tryFenceActiveSCIMConnection(database, connectionId);
	if (binding) return binding;
	throw createSCIMError("UNAUTHORIZED", {
		detail: "SCIM connection is decommissioned",
	});
}

/** Attempts to fence a connection without assigning an HTTP failure policy. */
export async function tryFenceActiveSCIMConnection(
	database: Pick<DBTransactionAdapter, "incrementOne">,
	connectionId: string,
): Promise<SCIMConnectionBinding | null> {
	return database.incrementOne<SCIMConnectionBinding>({
		model: "scimConnectionBinding",
		where: [
			{
				field: "connectionKey",
				value: createSCIMConnectionKey(connectionId),
			},
			{ field: "connectionId", value: connectionId },
			{ field: "decommissionStatus", value: "active" },
		],
		increment: { decommissionRevision: 1 },
	});
}
