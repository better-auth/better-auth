import type { AsyncLocalStorage } from "../async_hooks";
import { getAsyncLocalStorage } from "../async_hooks";
import type { GenericEndpointContext, GraphAdapter } from "../types/context";
import { runWithTransaction } from "./transaction";
import type { DBAdapter } from "../db/adapter";
import { APIError } from "better-call";

let currentContextAsyncStorage: AsyncLocalStorage<GraphAdapter> | null = null;

const ensureAsyncStorage = async () => {
	if (!currentContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentContextAsyncStorage = new AsyncLocalStorage();
	}
	return currentContextAsyncStorage;
};

export async function getCurrentGraphContext(
	graphAdapter?: GraphAdapter,
): Promise<GraphAdapter> {
	const als = await ensureAsyncStorage();
	const context = als.getStore();
	if (context) return context as GraphAdapter;
	if (graphAdapter) return graphAdapter;
	throw new Error(
		"No graph context found. Please make sure you are calling this function within a `runWithEndpointContext` callback.",
	);
}

export async function runWithGraphContext<T>(
	adapter: GraphAdapter,
	fn: () => Promise<T>,
): Promise<T> {
	const als = await ensureAsyncStorage();
	const transactionAdapter = adapter.transaction();
	console.log("running with graph id", transactionAdapter.id);
	const result = await als.run(transactionAdapter, fn);
	console.log("committing graph transaction", transactionAdapter.id);
	await transactionAdapter.commit();
	return result;
}

export function withTransaction<T extends GenericEndpointContext, R = any>(
	endpoint: (ctx: T) => Promise<R>,
) {
	return async (ctx: T) => {
		return await runWithTransaction(ctx.context.adapter, async () => {
			return await runWithGraphContext(ctx.context.graphAdapter, async () => {
				return await endpoint(ctx);
			});
		});
	};
}

export function runWithGraphTransaction<R>(
	dbAdapter: DBAdapter,
	graphAdapter: GraphAdapter,
	fn: () => Promise<R>,
): Promise<R> {
	console.log("running with graph transaction", dbAdapter.id, graphAdapter.id);
	return runWithTransaction(dbAdapter, async () => {
		return await runWithGraphContext(graphAdapter, fn);
	});
}

export async function authorize<T extends GenericEndpointContext>(
	ctx: T,
	subjectType: string,
	subjectId: string,
	permissionName: string,
	objectType: string,
	objectId: string,
	message: string,
) {
	const graphAdapter = await getCurrentGraphContext(ctx.context.graphAdapter);
	if (ctx.context.options.graph?.enabled) {
		if (
			!(await graphAdapter.check(
				subjectType,
				subjectId,
				permissionName,
				objectType,
				objectId,
			))
		) {
			throw new APIError("FORBIDDEN", {
				message: message,
			});
		}
	}
}
