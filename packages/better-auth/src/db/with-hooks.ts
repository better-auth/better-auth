import type { EndpointContext } from "better-call";
import type {
	Adapter,
	AuthContext,
	AuthPluginSchema,
	BetterAuthOptions,
	GenericEndpointContext,
	Models,
	SchemaTypes,
	TransactionAdapter,
	Where,
} from "../types";

export function getWithHooks<S extends AuthPluginSchema>(
	adapter: Adapter<S>,
	ctx: {
		options: BetterAuthOptions<S>;
		hooks: Exclude<BetterAuthOptions<S>["databaseHooks"], undefined>[];
	},
) {
	const hooks = ctx.hooks;
	type BaseModels = Extract<
		Models,
		"user" | "account" | "session" | "verification"
	>;

	async function createWithHooks<
		M extends BaseModels,
		D extends Omit<SchemaTypes<S[M], true>, "id"> = Omit<
			SchemaTypes<S[M]>,
			"id"
		>,
	>(
		data: D,
		model: M,
		customCreateFn?: {
			fn: (data: D) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	): Promise<SchemaTypes<S[M]> | null> {
		let actualData = data;
		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.before;
			if (toRun) {
				const result = await toRun(actualData as any, context as any);
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
				? await (trxAdapter || adapter).create({
						model,
						data: actualData,
						forceAllowId: true,
					})
				: customCreated;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.after;
			if (toRun) {
				await toRun(created as any, context as any);
			}
		}

		return created;
	}

	async function updateWithHooks<
		M extends BaseModels,
		R extends any,
		D extends Partial<SchemaTypes<S[M]>> = Partial<SchemaTypes<S[M]>>,
	>(
		data: D,
		where: Where<S[M], keyof S[M]["fields"] & string>[],
		model: M,
		customUpdateFn?: {
			fn: (data: D) => void | Promise<R>;
			executeMainFn?: boolean;
		},
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, context as any);
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
				? await (trxAdapter || adapter).update({
						model,
						update: actualData,
						where,
					})
				: customUpdated;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.after;
			if (toRun) {
				await toRun(updated as any, context as any);
			}
		}
		return updated;
	}

	async function updateManyWithHooks<
		M extends BaseModels,
		D extends Partial<SchemaTypes<S[M]>> = Partial<SchemaTypes<S[M]>>,
	>(
		data: D,
		where: Where<S[M], keyof S[M]["fields"] & string>[],
		model: M,
		customUpdateFn?: {
			fn: (data: D) => void | Promise<any>;
			executeMainFn?: boolean;
		},
		context?:
			| GenericEndpointContext<S>
			| EndpointContext<any, any, AuthContext<S>>,
		trxAdapter?: TransactionAdapter<S>,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any, context as any);
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
				? await (trxAdapter || adapter).updateMany({
						model,
						update: actualData,
						where,
					})
				: customUpdated;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.after;
			if (toRun) {
				await toRun(updated as any, context as any);
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
