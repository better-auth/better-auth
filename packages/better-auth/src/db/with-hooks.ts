import type {
	Adapter,
	BetterAuthOptions,
	GenericEndpointContext,
	Models,
	Where,
} from "../types";

export function getWithHooks(
	adapter: Adapter,
	ctx: {
		options: BetterAuthOptions;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
	},
) {
	const hooks = ctx.hooks;
	type BaseModels = Extract<
		Models,
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
				? await adapter.create<T>({
						model,
						data: actualData as any,
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
				? await adapter.update<T>({
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
				? await adapter.updateMany({
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
	return {
		createWithHooks,
		updateWithHooks,
		updateManyWithHooks,
	};
}
