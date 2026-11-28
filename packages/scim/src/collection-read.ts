import type { DBAdapter, Where } from "better-auth";
import type { SCIMFilterCombinator } from "./collection-query";
import { SCIM_UNBOUNDED_ROW_LIMIT } from "./persistence";

function compareSCIMOrderKey(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * List a connection-scoped SCIM collection. Uniform `and` uses one adapter
 * query. Uniform `or` unions equality matches by `id`/`orderKey`, then loads
 * full rows for the requested page while re-applying each equality.
 */
export async function querySCIMFilteredCollection<
	Filter,
	Row extends { id: string; orderKey: string },
>(
	adapter: Pick<DBAdapter, "count" | "findMany">,
	input: {
		model: "scimUser" | "scimGroup";
		connectionId: string;
		filters: readonly Filter[];
		combinator: SCIMFilterCombinator;
		pagination: { count: number; offset: number };
		createWhere: (connectionId: string, filters: readonly Filter[]) => Where[];
	},
): Promise<{ totalResults: number; rows: Row[] }> {
	const { model, connectionId, filters, combinator, pagination, createWhere } =
		input;
	if (combinator !== "or" || filters.length <= 1) {
		const where = createWhere(connectionId, filters);
		const totalResults = await adapter.count({ model, where });
		const rows =
			pagination.count === 0
				? []
				: await adapter.findMany<Row>({
						model,
						where,
						limit: pagination.count,
						offset: pagination.offset,
						sortBy: { field: "orderKey", direction: "asc" },
					});
		return { totalResults, rows };
	}

	const orderById = new Map<string, string>();
	const keyBatches = await Promise.all(
		filters.map((filter) =>
			adapter.findMany<{ id: string; orderKey: string }>({
				model,
				where: createWhere(connectionId, [filter]),
				select: ["id", "orderKey"],
				limit: SCIM_UNBOUNDED_ROW_LIMIT,
			}),
		),
	);
	for (const keys of keyBatches) {
		for (const key of keys) {
			if (!orderById.has(key.id)) orderById.set(key.id, key.orderKey);
		}
	}
	const orderedIds = [...orderById.entries()]
		.sort((left, right) => compareSCIMOrderKey(left[1], right[1]))
		.map(([id]) => id);
	const totalResults = orderedIds.length;
	if (pagination.count === 0) return { totalResults, rows: [] };
	const pageIds = orderedIds.slice(
		pagination.offset,
		pagination.offset + pagination.count,
	);
	if (pageIds.length === 0) return { totalResults, rows: [] };

	const byId = new Map<string, Row>();
	const matchBatches = await Promise.all(
		filters.map((filter) =>
			adapter.findMany<Row>({
				model,
				where: [
					...createWhere(connectionId, [filter]),
					{ field: "id", value: pageIds, operator: "in" },
				],
				limit: pageIds.length,
			}),
		),
	);
	for (const matches of matchBatches) {
		for (const row of matches) byId.set(row.id, row);
	}
	return {
		totalResults,
		rows: pageIds.flatMap((id) => {
			const row = byId.get(id);
			return row ? [row] : [];
		}),
	};
}
