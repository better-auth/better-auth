import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import type { DBPreservedModels } from "@better-auth/core/db";
import type { DBAdapter, Where } from "@better-auth/core/db/adapter";
import { getCurrentAdapter } from "../context/transaction";

export function getWithHooks(
	adapter: DBAdapter<BetterAuthOptions>,
	ctx: {
		options: BetterAuthOptions;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
	},
) {
	const hooks = ctx.hooks;
	type BaseModels = Extract<
		DBPreservedModels,
		"user" | "account" | "session" | "verification"
	>;
	async function createWithHooks<T extends Record<string, any>>(
		data: T,
		model: BaseModels,
		customCreateFn?: {
			fn: (data: Record<string, any>) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?: GenericEndpointContext,
	) {
		let actualData = data;
		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.before;
			if (toRun) {
				const result = await toRun(actualData as any, context);
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

		const customCreated = customCreateFn
			? await customCreateFn.fn(actualData)
			: null;
		const created =
			!customCreateFn || customCreateFn.executeMainFn
				? await (await getCurrentAdapter(adapter)).create<T>({
						model,
						data: actualData as any,
						forceAllowId: true,
					})
				: customCreated;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.after;
			if (toRun) {
				await toRun(created as any, context);
			}
		}

		return created;
	}

	async function updateWithHooks<T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: BaseModels,
		customUpdateFn?: {
			fn: (data: Record<string, any>) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?: GenericEndpointContext,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, context);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object";
				actualData = isObject ? (result as any).data : result;
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

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.after;
			if (toRun) {
				await toRun(updated as any, context);
			}
		}
		return updated;
	}

	async function updateManyWithHooks<T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: BaseModels,
		customUpdateFn?: {
			fn: (data: Record<string, any>) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?: GenericEndpointContext,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, context);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object";
				actualData = isObject ? (result as any).data : result;
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

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.after;
			if (toRun) {
				await toRun(updated as any, context);
			}
		}

		return updated;
	}

	async function deleteWithHooks<T extends Record<string, any>>(
		where: Where[],
		model: BaseModels,
		customDeleteFn?: {
			fn: (where: Where[]) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?: GenericEndpointContext,
	) {
		let entityToDelete: T | null = null;

		try {
			const entities = await (await getCurrentAdapter(adapter)).findMany<T>({
				model,
				where,
				limit: 1,
			});
			entityToDelete = entities[0] || null;
		} catch (error) {
			// If we can't find the entity, we'll still proceed with deletion
		}

		if (entityToDelete) {
			for (const hook of hooks || []) {
				const toRun = hook[model]?.delete?.before;
				if (toRun) {
					const result = await toRun(entityToDelete as any, context);
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
				? await (await getCurrentAdapter(adapter)).delete({
						model,
						where,
					})
				: customDeleted;

		if (entityToDelete) {
			for (const hook of hooks || []) {
				const toRun = hook[model]?.delete?.after;
				if (toRun) {
					await toRun(entityToDelete as any, context);
				}
			}
		}

		return deleted;
	}

	async function deleteManyWithHooks<T extends Record<string, any>>(
		where: Where[],
		model: BaseModels,
		customDeleteFn?: {
			fn: (where: Where[]) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?: GenericEndpointContext,
	) {
		let entitiesToDelete: T[] = [];

		try {
			entitiesToDelete = await (await getCurrentAdapter(adapter)).findMany<T>({
				model,
				where,
			});
		} catch (error) {
			// If we can't find the entities, we'll still proceed with deletion
		}

		for (const entity of entitiesToDelete) {
			for (const hook of hooks || []) {
				const toRun = hook[model]?.delete?.before;
				if (toRun) {
					const result = await toRun(entity as any, context);
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
			for (const hook of hooks || []) {
				const toRun = hook[model]?.delete?.after;
				if (toRun) {
					await toRun(entity as any, context);
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
