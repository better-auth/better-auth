import type { BetterAuthOptions } from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { BetterAuthDBSchema } from "@better-auth/core/db";
import type {
	AtomicWriteOperation,
	DBAdapter,
} from "@better-auth/core/db/adapter";
import { getDirectCascadeDeleteReferences } from "@better-auth/core/db/internal";

const coreModels = new Set([
	"user",
	"identity",
	"account",
	"session",
	"verification",
	"rate-limit",
]);

/**
 * Creates the application-level lifecycle for plugin records owned by an
 * Account. SQL foreign keys may perform the same cascade, but the explicit
 * operations make the schema contract portable to adapters without foreign
 * keys, including MongoDB.
 */
export function createAccountOwnedRecordCleanup<
	Options extends BetterAuthOptions,
>(adapter: DBAdapter<Options>, schema: BetterAuthDBSchema) {
	const references = getDirectCascadeDeleteReferences(schema, "account").filter(
		({ model, referencedField }) =>
			referencedField === "id" && !coreModels.has(model),
	);

	return {
		async deleteInCurrentTransaction(accountId: string): Promise<void> {
			const transactionAdapter = await getCurrentAdapter(adapter);
			for (const reference of references) {
				await transactionAdapter.deleteMany({
					model: reference.model,
					where: [{ field: reference.field, value: accountId }],
				});
			}
		},
		getAtomicDeleteOperations(accountId: string): AtomicWriteOperation[] {
			return references.map((reference) => ({
				type: "deleteMany",
				model: reference.model,
				where: [{ field: reference.field, value: accountId }],
			}));
		},
	};
}
