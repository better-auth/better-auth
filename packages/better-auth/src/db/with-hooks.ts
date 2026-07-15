import type { BetterAuthOptions } from "@better-auth/core";
import {
	getCurrentAdapter,
	getCurrentAuthContext,
	queueAfterTransactionHook,
} from "@better-auth/core/context";
import type {
	Account,
	BaseModelNames,
	Identity,
	Session,
	User,
	Verification,
} from "@better-auth/core/db";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
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

type CoreModelRecord<
	Options extends BetterAuthOptions,
	Model extends BaseModelNames,
> = Model extends "user"
	? User<Options["user"], Options["plugins"]>
	: Model extends "identity"
		? Identity<Options["identity"], Options["plugins"]>
		: Model extends "account"
			? Account<Options["account"], Options["plugins"]>
			: Model extends "session"
				? Session<Options["session"], Options["plugins"]>
				: Verification<Options["verification"], Options["plugins"]>;

export function getWithHooks<Options extends BetterAuthOptions>(
	adapter: DBAdapter<Options>,
	ctx: { hooks: DatabaseHooksEntry[] },
) {
	const hooksEntries = ctx.hooks;

	async function prepareCreateWithHooks<T extends Record<string, unknown>>(
		data: T,
		model: BaseModelNames,
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
						(
							toRun as (
								data: T,
								context: unknown,
							) =>
								| false
								| void
								| { data: Partial<T> }
								| Promise<false | void | { data: Partial<T> }>
						)(actualData, context),
				);
				if (result === false) return null;
				if (result && typeof result === "object" && "data" in result) {
					actualData = {
						...actualData,
						...result.data,
					};
				}
			}
		}

		return {
			data: actualData,
			async queueAfterHooks<Created extends Record<string, unknown>>(
				created: Created,
			) {
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
									(
										toRun as (
											data: Created,
											context: unknown,
										) => void | Promise<void>
									)(created, context),
							);
						});
					}
				}
			},
		};
	}

	async function createWithHooks<
		Model extends BaseModelNames,
		T extends Record<string, unknown>,
	>(
		data: T,
		model: Model,
		customCreateFn?:
			| {
					fn: (
						data: CoreModelRecord<Options, Model>,
					) =>
						| CoreModelRecord<Options, Model>
						| Promise<CoreModelRecord<Options, Model>>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const prepared = await prepareCreateWithHooks(data, model);
		if (!prepared) return null;

		const currentAdapter = await getCurrentAdapter(adapter);
		if (!customCreateFn) {
			const created = await currentAdapter.create<
				Record<string, unknown>,
				CoreModelRecord<Options, Model>
			>({
				model,
				data: prepared.data,
				forceAllowId: true,
			});
			await prepared.queueAfterHooks(created);
			return created;
		}

		const initialRecord = customCreateFn.executeMainFn
			? await currentAdapter.create<
					Record<string, unknown>,
					CoreModelRecord<Options, Model>
				>({
					model,
					data: prepared.data,
					forceAllowId: true,
				})
			: (prepared.data as unknown as CoreModelRecord<Options, Model>);
		const created = await customCreateFn.fn(initialRecord);
		await prepared.queueAfterHooks(created);
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

	async function prepareDeleteWithHooks<T extends Record<string, unknown>>(
		where: Where[],
		model: BaseModelNames,
		options?: {
			entities?: T[] | undefined;
			limit?: number | undefined;
			requireSnapshot?: boolean | undefined;
		},
	) {
		const context = await getCurrentAuthContext().catch(() => null);
		let entities = options?.entities;
		if (!entities) {
			try {
				const currentAdapter = await getCurrentAdapter(adapter);
				// `findMany` defaults to 100 rows. Bulk hooks need one complete,
				// bounded snapshot so a veto happens before any matched row is deleted.
				const snapshotLimit =
					options?.limit ?? (await currentAdapter.count({ model, where }));
				entities = snapshotLimit
					? await currentAdapter.findMany<T>({
							model,
							where,
							limit: snapshotLimit,
						})
					: [];
			} catch (error) {
				if (options?.requireSnapshot) throw error;
				// Preserve the existing best-effort hook behavior outside atomic
				// lifecycles and let the adapter operation decide the outcome.
				entities = [];
			}
		}

		for (const entity of entities) {
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
							(
								toRun as (
									data: T,
									context: unknown,
								) => false | void | Promise<false | void>
							)(entity, context),
					);
					if (result === false) return null;
				}
			}
		}

		return {
			entities,
			async queueAfterHooks(committedEntities: readonly T[] = entities) {
				for (const entity of committedEntities) {
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
										(
											toRun as (
												data: T,
												context: unknown,
											) => void | Promise<void>
										)(entity, context),
								);
							});
						}
					}
				}
			},
		};
	}

	async function deleteWithHooks<T extends Record<string, unknown>>(
		where: Where[],
		model: BaseModelNames,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => unknown | Promise<unknown>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const prepared = await prepareDeleteWithHooks<T>(where, model, {
			limit: 1,
		});
		if (!prepared) return null;
		const entityToDelete = prepared.entities[0] ?? null;

		if (customDeleteFn && !customDeleteFn.executeMainFn) {
			const customDeleted = await customDeleteFn.fn(where);
			await prepared.queueAfterHooks();
			return customDeleted;
		}

		if (customDeleteFn) await customDeleteFn.fn(where);
		if (!entityToDelete) return null;
		const deleted = await (await getCurrentAdapter(adapter)).consumeOne<T>({
			model,
			where,
		});
		if (deleted) await prepared.queueAfterHooks([deleted]);
		return deleted;
	}

	async function deleteManyWithHooks<T extends Record<string, unknown>>(
		where: Where[],
		model: BaseModelNames,
		customDeleteFn?:
			| {
					fn: (where: Where[]) => unknown | Promise<unknown>;
					executeMainFn?: boolean;
			  }
			| undefined,
	) {
		const prepared = await prepareDeleteWithHooks<T>(where, model, {
			requireSnapshot: true,
		});
		if (!prepared) return null;

		if (customDeleteFn && !customDeleteFn.executeMainFn) {
			const customDeleted = await customDeleteFn.fn(where);
			await prepared.queueAfterHooks();
			return customDeleted;
		}

		if (customDeleteFn) await customDeleteFn.fn(where);
		const currentAdapter = await getCurrentAdapter(adapter);
		const deletedEntities: T[] = [];
		for (const entity of prepared.entities) {
			const id = entity.id;
			if (typeof id !== "string" && typeof id !== "number") {
				throw new BetterAuthError(
					`Delete hooks for model "${model}" require each snapshot to include its primary id.`,
				);
			}
			const deleted = await currentAdapter.consumeOne<T>({
				model,
				where: [{ field: "id", value: id }],
			});
			if (deleted) deletedEntities.push(deleted);
		}
		await prepared.queueAfterHooks(deletedEntities);
		return deletedEntities.length;
	}

	/**
	 * Wraps an atomic consume operation in the plugin `delete.before` and
	 * `delete.after` hook lifecycle. The caller supplies a `consumeFn` that
	 * performs the actual single-row delete-and-return (typically the
	 * adapter's `consumeOne`). The first concurrent caller wins, subsequent
	 * racers resolve to `null` without firing `delete.after` hooks.
	 *
	 * `preSnapshot` lets the caller hand in a row it already fetched so
	 * `delete.before` hooks don't trigger a second read. Without it, the
	 * helper falls back to a best-effort `findMany` against `hookWhere`.
	 * The snapshot only feeds `delete.before`; the `consumeFn` return value
	 * is the race gate.
	 *
	 * Returning `false` from a `delete.before` hook aborts the consume and
	 * the helper resolves to `null` (no `consumeFn` call, no after hooks).
	 */
	async function consumeOneWithHooks<T extends Record<string, any>>(
		model: BaseModelNames,
		hookWhere: Where[],
		consumeFn: () => Promise<T | null>,
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

		const consumed = await consumeFn();
		if (!consumed) return null;

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
							toRun(consumed as any, context),
					);
				});
			}
		}

		return consumed;
	}

	return {
		prepareCreateWithHooks,
		prepareDeleteWithHooks,
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
		deleteWithHooks,
		deleteManyWithHooks,
		consumeOneWithHooks,
	};
}
