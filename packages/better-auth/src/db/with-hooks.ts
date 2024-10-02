import type { Adapter, Where } from "./../types/adapter";
import type { BetterAuthOptions } from "../types";
import { getAuthTables } from "./get-tables";
import { generateId } from "../utils/id";

export function getWithHooks(
	adapter: Adapter,
	ctx: {
		options: BetterAuthOptions;
		hooks: Exclude<BetterAuthOptions["databaseHooks"], undefined>[];
	},
) {
	const hooks = ctx.hooks;
	const tables = getAuthTables(ctx.options);
	type Models = "user" | "account" | "session" | "verification";
	async function createWithHooks<T extends Record<string, any>>(
		data: T,
		model: Models,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.before;
			if (toRun) {
				const result = await toRun(data as any);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object";
				actualData = isObject ? (result as any).data : result;
			}
		}

		const created = await adapter.create<T>({
			model: tables[model].tableName,
			data: {
				id: generateId(),
				...actualData,
			},
		});

		for (const hook of hooks || []) {
			const toRun = hook[model]?.create?.after;
			if (toRun) {
				await toRun(created as any);
			}
		}

		return created;
	}

	async function updateWithHooks<T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: Models,
	) {
		let actualData = data;

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.before;
			if (toRun) {
				const result = await toRun(data as any);
				if (result === false) {
					return null;
				}
				const isObject = typeof result === "object";
				actualData = isObject ? (result as any).data : result;
			}
		}

		const updated = await adapter.update<T>({
			model: tables[model].tableName,
			update: actualData,
			where,
		});

		for (const hook of hooks || []) {
			const toRun = hook[model]?.update?.after;
			if (toRun) {
				await toRun(updated as any);
			}
		}

		return updated;
	}
	return {
		createWithHooks,
		updateWithHooks,
	};
}
