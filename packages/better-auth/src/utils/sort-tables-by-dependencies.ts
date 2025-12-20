export function sortTablesByDependencies<T extends {
	table: string;
	fields?: Record<string, any>;
	order?: number;
}>(tables: T[]): T[] {
	const graph = new Map<string, Set<string>>();
	const tableMap = new Map<string, T>();

	for (const table of tables) {
		tableMap.set(table.table, table);
		graph.set(table.table, new Set());
	}

	for (const table of tables) {
		for (const field of Object.values(table.fields ?? {})) {
			if (field?.references?.model) {
				graph.get(table.table)?.add(field.references.model);
			}
		}
	}

	const visited = new Set<string>();
	const visiting = new Set<string>();
	const result: T[] = [];

	function visit(name: string) {
		if (visited.has(name)) return;
		if (visiting.has(name)) return; // prevent cycles from crashing

		visiting.add(name);
		for (const dep of graph.get(name) ?? []) {
			if (tableMap.has(dep)) visit(dep);
		}
		visiting.delete(name);
		visited.add(name);
		result.push(tableMap.get(name)!);
	}

	for (const table of tables) {
		visit(table.table);
	}

	return result;
}
