import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import { deserializeApiKey, parseDoubleStringifiedMetadata } from "./adapter";
import { configIdMatches, isDefaultConfigId } from "./routes";
import type { ApiKey } from "./types";

/**
 * Import API keys that were stored only in secondary storage before 1.8.
 *
 * Run once before serving traffic with 1.8, with legacy API key traffic paused.
 * Pass the storage backend's original key names and values for each affected
 * configuration. Only records addressed by their stored key value are imported.
 *
 * @returns The number of rows inserted. Existing database rows are preserved.
 */
export async function migrateSecondaryStorageApiKeys<
	Options extends BetterAuthOptions,
>({
	auth,
	entries,
	configIds = ["default"],
}: {
	auth: {
		$context: Promise<Pick<AuthContext<Options>, "adapter" | "options">>;
	};
	entries:
		| Iterable<readonly [name: string, value: unknown]>
		| AsyncIterable<readonly [name: string, value: unknown]>;
	/** IDs of configurations that stored keys only in secondary storage. */
	configIds?: readonly string[];
}): Promise<number> {
	const { adapter, options } = await auth.$context;
	const generateId = options.advanced?.database?.generateId;
	const preserveId = generateId !== "serial" && generateId !== false;
	const allowedConfigs = new Set(configIds);
	let imported = 0;

	for await (const [name, value] of entries) {
		const row = deserializeApiKey(value);
		if (!row?.key || name !== `api-key:${row.key}`) continue;

		const configId = isDefaultConfigId(row.configId) ? "default" : row.configId;
		if (!allowedConfigs.has(configId)) continue;
		if (
			!row.id ||
			!row.referenceId ||
			[
				row.createdAt,
				row.updatedAt,
				row.expiresAt,
				row.lastRequest,
				row.lastRefillAt,
			].some((date) => date && Number.isNaN(date.getTime()))
		) {
			throw new Error("Invalid legacy API key record");
		}
		if (row.expiresAt && row.expiresAt <= new Date()) continue;

		const existing = await adapter.findOne<ApiKey>({
			model: "apikey",
			where: [{ field: "key", value: row.key }],
		});
		if (existing) {
			if (
				existing.referenceId !== row.referenceId ||
				!configIdMatches(existing.configId, configId) ||
				(preserveId && existing.id !== row.id)
			) {
				throw new Error(
					"Legacy API key conflicts with an existing database row",
				);
			}
			continue;
		}

		const { id, ...data } = row;
		await adapter.create({
			model: "apikey",
			data: {
				...data,
				...(preserveId ? { id } : {}),
				configId,
				metadata: parseDoubleStringifiedMetadata(row.metadata),
			},
			forceAllowId: preserveId,
		});
		imported++;
	}

	return imported;
}
