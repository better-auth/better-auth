import type { BetterAuthOptions } from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	queueAfterTransactionHook,
} from "@better-auth/core/context";
import type { BaseModelNames, ModelNames } from "@better-auth/core/db";
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

type DeleteHookEntry = {
	delete?: {
		before?: (data: Record<string, any>, context: unknown) => Promise<any>;
		after?: (data: Record<string, any>, context: unknown) => Promise<any>;
	};
};

export function getWithHooks(
	adapter: DBAdapter<BetterAuthOptions>,
	ctx: {
		options: BetterAuthOptions;
		hooks: DatabaseHooksEntry[];
	},
) {
	const hooksEntries = ctx.hooks;
	const getDeleteHooks = (
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>,
		model: Exclude<ModelNames, "rate-limit">,
	) => {
		return (hooks as Record<string, DeleteHookEntry | undefined>)[model];
	};
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
		model: Exclude<ModelNames, "rate-limit">,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => void | Promise<T | null | void>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entityToDelete: T | null = null;
		let entityLookupFailed = false;

		try {
			const entities = await (await getCurrentAdapter(adapter)).findMany<T>({
				model,
				where,
				limit: 1,
			});
			entityToDelete = entities[0] || null;
		} catch {
			entityLookupFailed = true;
			// If we can't find the entity, we'll still proceed with deletion
		}

		if (entityToDelete) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = getDeleteHooks(hooks, model)?.delete?.before;
				if (toRun) {
					const result = await withSpan(
						`db delete.before ${model}`,
						{
							[ATTR_HOOK_TYPE]: "delete.before",
							[ATTR_DB_COLLECTION_NAME]: model,
							[ATTR_CONTEXT]: source,
						},
						() => toRun(entityToDelete as any, context),
					);
					if (result === false) {
						return null;
					}
				}
			}
		}

		let customDeleted: T | null | void = undefined;
		if (customDeleteFn) {
			customDeleted = await customDeleteFn.fn(where);
		}

		const shouldRunAdapterDelete =
			!customDeleteFn || customDeleteFn.executeMainFn;
		const shouldAttemptAdapterDelete =
			shouldRunAdapterDelete && (entityToDelete !== null || entityLookupFailed);
		if (shouldAttemptAdapterDelete) {
			await (await getCurrentAdapter(adapter)).delete({
				model,
				where,
			});
		}

		const deleted = shouldRunAdapterDelete
			? customDeleted === undefined
				? entityToDelete
				: customDeleted
			: (customDeleted ?? null);
		const entityForHooks =
			entityToDelete ??
			(deleted && typeof deleted === "object" ? (deleted as T) : null);

		if (entityForHooks) {
			for (const { source, hooks } of hooksEntries) {
				const toRun = getDeleteHooks(hooks, model)?.delete?.after;
				if (toRun) {
					await queueAfterTransactionHook(async () => {
						await withSpan(
							`db delete.after ${model}`,
							{
								[ATTR_HOOK_TYPE]: "delete.after",
								[ATTR_DB_COLLECTION_NAME]: model,
								[ATTR_CONTEXT]: source,
							},
							() => toRun(entityForHooks as any, context),
						);
					});
				}
			}
		}

		return deleted ?? null;
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

	return {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
	};
}
