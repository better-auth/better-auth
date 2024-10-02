import type { Adapter, Where } from "./../types/adapter";
import type { BetterAuthOptions } from "../types";
import { getAuthTables } from "./get-tables";
import { generateId } from "../utils";

export function getWithHooks(adapter: Adapter, options: BetterAuthOptions) {
	const hooks = options.databaseHooks;
	const tables = getAuthTables(options);
	type Models = "user" | "account" | "session" | "verification";
	async function createWithHooks<T extends Record<string, any>>(
		data: T,
		model: Models,
	) {
		let actualData = data;
		if (hooks?.[model]?.create?.before) {
			const result = await hooks[model].create.before(data as any);
			if (result === false) {
				return null;
			}
			const isObject = typeof result === "object";
			actualData = isObject ? (result as any).data : result;
		}

		const created = await adapter.create<T>({
			model: tables[model].tableName,
			data: {
				id: generateId(),
				...actualData,
			},
		});
		if (hooks?.[model]?.create?.after && created) {
			await hooks[model].create.after(created as any);
		}
		return created;
	}

	async function updateWithHooks<T extends Record<string, any>>(
		data: any,
		where: Where[],
		model: Models,
	) {
		let actualData = data;
		if (hooks?.[model]?.update?.before) {
			const result = await hooks[model].update.before(data as any);
			if (result === false) {
				return null;
			}
			const isObject = typeof result === "object";
			actualData = isObject ? (result as any).data : result;
		}

		const updated = await adapter.update<T>({
			model: tables[model].tableName,
			update: actualData,
			where,
		});
		if (hooks?.[model]?.update?.after && updated) {
			await hooks[model].update.after(updated as any);
		}
		return updated;
	}

	return {
		createWithHooks,
		updateWithHooks,
	};
}
