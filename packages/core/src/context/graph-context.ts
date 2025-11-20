import type { AsyncLocalStorage } from "../async_hooks";
import { getAsyncLocalStorage } from "../async_hooks";
import type { GenericEndpointContext, GraphAdapter } from "../types/context";
import { runWithTransaction } from "./transaction";
import type { DBAdapter } from "../db/adapter";

let currentContextAsyncStorage: AsyncLocalStorage<GraphAdapter> | null = null;

const ensureAsyncStorage = async () => {
	if (!currentContextAsyncStorage) {
		const AsyncLocalStorage = await getAsyncLocalStorage();
		currentContextAsyncStorage = new AsyncLocalStorage();
	}
	return currentContextAsyncStorage;
};

export async function getCurrentGraphContext(): Promise<GraphAdapter> {
	const als = await ensureAsyncStorage();
	const context = als.getStore();
	if (!context) {
		throw new Error(
			"No graph context found. Please make sure you are calling this function within a `runWithEndpointContext` callback.",
		);
	}
	return context;
}

export async function runWithGraphContext<T>(
	adapter: GraphAdapter,
	fn: () => Promise<T>,
): Promise<T> {
	const als = await ensureAsyncStorage();
	const transactionAdapter = adapter.transaction();
	const result = await als.run(transactionAdapter, fn);
	await transactionAdapter.commit();
	return result;
}

export function withTransaction<T extends GenericEndpointContext>(
	endpoint: (ctx: T) => Promise<any>,
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
	console.log(dbAdapter, graphAdapter);
	return runWithTransaction(dbAdapter, async () => {
		return await runWithGraphContext(graphAdapter, fn);
	});
}
