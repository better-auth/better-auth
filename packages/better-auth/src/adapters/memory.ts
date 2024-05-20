import type { Adapter, Where } from "./types";

const database: {
	[key: string]: Record<string, any>[];
} = {};

function whereClause(where: Where[], table: Record<string, any>[]) {
	const index = table.findIndex((record) => {
		let isRecord = false;
		for (const clause of where) {
			const value = record[clause.field];
			if (value) {
				if (clause.operator === "eq" || !clause.operator) {
					if (value === clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
				if (clause.operator === "ne") {
					if (value !== clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
				if (clause.operator === "gt") {
					if (value < clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
				if (clause.operator === "lt") {
					if (value > clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
				if (clause.operator === "lte") {
					if (value >= clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
				if (clause.operator === "gte") {
					if (value <= clause.value) {
						isRecord = true;
					} else {
						isRecord = false;
					}
				}
			}
		}
		return isRecord;
	});
	return index;
}

export const memoryAdapter = (_db: {
	[key: string]: Record<string, any>[];
}): Adapter => {
	let db = _db;
	return {
		async create(data) {
			const id = Math.random().toString(36).substring(7);
			db[data.model]?.push({
				id,
				...data.data,
			});
			return {
				id,
				...data.data,
			} as any;
		},
		async update(data) {
			const table = db[data.model];
			if (!table) {
				throw Error("");
			}
			const index = whereClause(data.where, table);
			if (index !== -1) {
				table[index] = {
					...table[index],
					...data.update,
				};
				db = {
					...db,
					[data.model]: table,
				};
				return table[index] as any;
			}
			throw new Error("Record missing");
		},

		async delete(data) {
			let table = db[data.model];
			if (!table) {
				throw Error("");
			}
			const index = whereClause(data.where, table);
			if (index !== -1) {
				table = table.filter((_, i) => i !== index);
				db = {
					...db,
					[data.model]: table,
				};
				return table[index] as any;
			}
			throw new Error("Record missing");
		},
		async findMany(data) {
			const table = db[data.model];
			if (!table) {
				throw Error("");
			}
			return table as any;
		},
		async findOne(data) {
			const table = db[data.model];
			if (!table) {
				throw Error("");
			}
			const index = whereClause(data.where, table);
			if (index !== -1) {
				if (data.select) {
					const result = table[index];
					const selectedData: Record<string, any> = {};
					for (const key of data.select) {
						selectedData[key] = result?.[key];
					}
					return selectedData;
				}
				return table[index] as any;
			}
			return null;
		},
	};
};
