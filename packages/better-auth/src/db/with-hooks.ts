import type { BetterAuthOptions } from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	queueAfterTransactionHook,
} from "@better-auth/core/context";
import type { BaseModelNames } from "@better-auth/core/db";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import {
	ATTR_CONTEXT,
	ATTR_DB_COLLECTION_NAME,
	ATTR_HOOK_TYPE,
	withSpan,
} from "@better-auth/core/instrumentation";

export type DatabaseHooksEntry = {
	source: string;
	hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>;
};

export function getWithHooks(
	adapter: DBAdapter<BetterAuthOptions>,
	ctx: {
		options: BetterAuthOptions;
		hooks: DatabaseHooksEntry[];
	},
) {
	const hooksEntries = ctx.hooks;
	async function createWithHooks<T extends Record<string, any>>(
		data: T,
		model: BaseModelNames,
		customCreateFn?:
			| {
					fn: (data: Record<string, any>) => void | Promise<any>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;
		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.create?.before;
			if (toRun) {
				const result = await withSpan(
					`db create.before ${model}`,
					{
						[ATTR_HOOK_TYPE]: "create.before",
						[ATTR_DB_COLLECTION_NAME]: model,
						[ATTR_CONTEXT]: source,
					},
					() =>
						// @ts-expect-error context type mismatch
						toRun(actualData as any, context),
				);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object" && "data" in result;
				if (isObject) {
					actualData = {
						...actualData,
						...result.data,
					};
				}
			}
		}

		let created: any = null;
		if (!customCreateFn || customCreateFn.executeMainFn) {
			created = await (await getCurrentAdapter(adapter)).create<T>({
				model,
				data: actualData as any,
				forceAllowId: true,
			});
		}
		if (customCreateFn?.fn) {
			created = await customCreateFn.fn(created ?? actualData);
		}

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.create?.after;
			if (toRun) {
				await queueAfterTransactionHook(async () => {
					await withSpan(
						`db create.after ${model}`,
						{
							[ATTR_HOOK_TYPE]: "create.after",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(created as any, context),
					);
				});
			}
		}

		return created;
	}

	async function updateWithHooks<T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: BaseModelNames,
		customUpdateFn?:
			| {
					fn: (data: Record<string, any>) => void | Promise<any>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.before;
			if (toRun) {
				const result = await withSpan(
					`db update.before ${model}`,
					{
						[ATTR_HOOK_TYPE]: "update.before",
						[ATTR_DB_COLLECTION_NAME]: model,
						[ATTR_CONTEXT]: source,
					},
					() =>
						// @ts-expect-error context type mismatch
						toRun(data as any, context),
				);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object" && "data" in result;
				if (isObject) {
					actualData = {
						...actualData,
						...result.data,
					};
				}
			}
		}

		const customUpdated = customUpdateFn
			? await customUpdateFn.fn(actualData)
			: null;

		const updated =
			!customUpdateFn || customUpdateFn.executeMainFn
				? await (await getCurrentAdapter(adapter)).update<T>({
						model,
						update: actualData,
						where,
					})
				: customUpdated;

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.after;
			if (toRun) {
				await queueAfterTransactionHook(async () => {
					await withSpan(
						`db update.after ${model}`,
						{
							[ATTR_HOOK_TYPE]: "update.after",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(updated as any, context),
					);
				});
			}
		}
		return updated;
	}

	async function updateManyWithHooks<_T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: BaseModelNames,
		customUpdateFn?:
			| {
					fn: (data: Record<string, any>) => void | Promise<any>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let actualData = data;

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.before;
			if (toRun) {
				const result = await withSpan(
					`db updateMany.before ${model}`,
					{
						[ATTR_HOOK_TYPE]: "updateMany.before",
						[ATTR_DB_COLLECTION_NAME]: model,
						[ATTR_CONTEXT]: source,
					},
					() =>
						// @ts-expect-error context type mismatch
						toRun(data as any, context),
				);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object" && "data" in result;
				if (isObject) {
					actualData = {
						...actualData,
						...result.data,
					};
				}
			}
		}

		const customUpdated = customUpdateFn
			? await customUpdateFn.fn(actualData)
			: null;

		const updated =
			!customUpdateFn || customUpdateFn.executeMainFn
				? await (await getCurrentAdapter(adapter)).updateMany({
						model,
						update: actualData,
						where,
					})
				: customUpdated;

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.update?.after;
			if (toRun) {
				await queueAfterTransactionHook(async () => {
					await withSpan(
						`db updateMany.after ${model}`,
						{
							[ATTR_HOOK_TYPE]: "updateMany.after",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(updated as any, context),
					);
				});
			}
		}

		return updated;
	}

	async function deleteWithHooks<T extends Record<string, any>>(
		where: Where[],
		model: BaseModelNames,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => void | Promise<any>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entityToDelete: T | null = null;

		try {
			const entities = await (await getCurrentAdapter(adapter)).findMany<T>({
				model,
				where,
				limit: 1,
			});
			entityToDelete = entities[0] || null;
		} catch {
			// If we can't find the entity, we'll still proceed with deletion
		}

		if (entityToDelete) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = hooks[model]?.delete?.before;
				if (toRun) {
					const result = await withSpan(
						`db delete.before ${model}`,
						{
							[ATTR_HOOK_TYPE]: "delete.before",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(entityToDelete as any, context),
					);
					if (result === false) {
						return null;
					}
				}
			}
		}

		const customDeleted = customDeleteFn
			? await customDeleteFn.fn(where)
			: null;

		const shouldRunAdapterDelete =
			!customDeleteFn || customDeleteFn.executeMainFn;
		const deleted =
			shouldRunAdapterDelete && entityToDelete
				? await (await getCurrentAdapter(adapter)).delete({
						model,
						where,
					})
				: customDeleted;

		if (entityToDelete) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = hooks[model]?.delete?.after;
				if (toRun) {
					await queueAfterTransactionHook(async () => {
						await withSpan(
							`db delete.after ${model}`,
							{
								[ATTR_HOOK_TYPE]: "delete.after",
								[ATTR_DB_COLLECTION_NAME]: model,
								[ATTR_CONTEXT]: source,
							},
							() =>
								// @ts-expect-error context type mismatch
								toRun(entityToDelete as any, context),
						);
					});
				}
			}
		}

		return deleted;
	}

	async function deleteManyWithHooks<T extends Record<string, any>>(
		where: Where[],
		model: BaseModelNames,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => void | Promise<any>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entitiesToDelete: T[] = [];

		try {
			entitiesToDelete = await (await getCurrentAdapter(adapter)).findMany<T>({
				model,
				where,
			});
		} catch {
			// If we can't find the entities, we'll still proceed with deletion
		}

		for (const entity of entitiesToDelete) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = hooks[model]?.delete?.before;
				if (toRun) {
					const result = await withSpan(
						`db delete.before ${model}`,
						{
							[ATTR_HOOK_TYPE]: "delete.before",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(entity as any, context),
					);
					if (result === false) {
						return null;
					}
				}
			}
		}

		const customDeleted = customDeleteFn
			? await customDeleteFn.fn(where)
			: null;

		const deleted =
			!customDeleteFn || customDeleteFn.executeMainFn
				? await (await getCurrentAdapter(adapter)).deleteMany({
						model,
						where,
					})
				: customDeleted;

		for (const entity of entitiesToDelete) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = hooks[model]?.delete?.after;
				if (toRun) {
					// Queue after hooks to run post-transaction
					await queueAfterTransactionHook(async () => {
						await withSpan(
							`db delete.after ${model}`,
							{
								[ATTR_HOOK_TYPE]: "delete.after",
								[ATTR_DB_COLLECTION_NAME]: model,
								[ATTR_CONTEXT]: source,
							},
							() =>
								// @ts-expect-error context type mismatch
								toRun(entity as any, context),
						);
					});
				}
			}
		}

		return deleted;
	}

	/**
	 * Wraps an atomic claim operation in the plugin `delete.before` and
	 * `delete.after` hook lifecycle. The caller supplies a `claimFn` that
	 * performs the actual single-row delete-and-return (typically the
	 * adapter's `claimOne`). The first concurrent caller wins, subsequent
	 * racers resolve to `null` without firing `delete.after` hooks.
	 *
	 * `preSnapshot` lets the caller hand in a row it already fetched so
	 * `delete.before` hooks don't trigger a second read. Without it, the
	 * helper falls back to a best-effort `findMany` against `hookWhere`.
	 * The snapshot only feeds `delete.before`; the `claimFn` return value
	 * is the race gate.
	 *
	 * Returning `false` from a `delete.before` hook aborts the claim and
	 * the helper resolves to `null` (no `claimFn` call, no after hooks).
	 */
	async function consumeOneWithHooks<T extends Record<string, any>>(
		model: BaseModelNames,
		hookWhere: Where[],
		claimFn: () => Promise<T | null>,
		preSnapshot?: T | null,
	): Promise<T | null> {
		const context = await getCurrentAuthContext().catch(() => null);
		const beforeHooks = hooksEntries.flatMap(({ source, hooks }) => {
			const fn = hooks[model]?.delete?.before;
			return fn ? [{ source, fn }] : [];
		});

		let snapshot: T | null = preSnapshot ?? null;
		if (beforeHooks.length) {
			if (!snapshot) {
				try {
					const rows = await (await getCurrentAdapter(adapter)).findMany<T>({
						model,
						where: hookWhere,
						limit: 1,
					});
					snapshot = rows[0] || null;
				} catch {}
			}

			if (snapshot) {
				for (const { source, fn } of beforeHooks) {
					const result = await withSpan(
						`db delete.before ${model}`,
						{
							[ATTR_HOOK_TYPE]: "delete.before",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							fn(snapshot as any, context),
					);
					if (result === false) {
						return null;
					}
				}
			}
		}

		const claimed = await claimFn();
		if (!claimed) return null;

		for (const { source, hooks } of hooksEntries) {
			const toRun = hooks[model]?.delete?.after;
			if (toRun) {
				await queueAfterTransactionHook(async () => {
					await withSpan(
						`db delete.after ${model}`,
						{
							[ATTR_HOOK_TYPE]: "delete.after",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() =>
							// @ts-expect-error context type mismatch
							toRun(claimed as any, context),
					);
				});
			}
		}

		return claimed;
	}

	return {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
		consumeOneWithHooks,
	};
}
