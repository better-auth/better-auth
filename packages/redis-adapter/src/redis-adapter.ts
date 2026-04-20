import type { BetterAuthOptions } from "@better-auth/core";
import type { CleanedWhere, JoinConfig } from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { RedisClientType } from "redis";

export interface RedisAdapterConfig {
	client: RedisClientType;
	ttl?: number;
}

export const redisAdapter = (
	config: RedisAdapterConfig,
): ReturnType<typeof createAdapterFactory<BetterAuthOptions>> => {
	const client = config.client;
	const ttl = config.ttl;

	let connecting: Promise<any> | null = null;

	async function ensureConnection() {
		if (client.isOpen) return;
		try {
			if (!connecting) connecting = client.connect();
			await connecting;
		} catch {}
	}

	function reviveDates(obj: any) {
		if (!obj || typeof obj !== "object") return obj;
		for (const key in obj) {
			const val = obj[key];
			if (
				typeof val === "string" &&
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)
			) {
				const d = new Date(val);
				if (!isNaN(d.getTime())) obj[key] = d;
			} else if (val && typeof val === "object") {
				reviveDates(val);
			}
		}
		return obj;
	}

	function safeParse(data: string | null) {
		try {
			if (!data) return null;
			return reviveDates(JSON.parse(data));
		} catch {
			return null;
		}
	}

	async function loadModel(model: string) {
		await ensureConnection();
		const keys: string[] = [];
		let cursor = "0";
		do {
			const res = await client.scan(cursor, {
				MATCH: `${model}:*`,
				COUNT: 100,
			});
			cursor = res.cursor;
			keys.push(...res.keys);
		} while (cursor !== "0");

		if (keys.length === 0) return [];

		const mgetRes = await client.mGet(keys);

		return mgetRes
			.map((val) => {
				const parsed = safeParse(val);
				if (!parsed) return null;
				// Ensure ID is always a string
				if (parsed.id !== undefined && parsed.id !== null) {
					parsed.id = String(parsed.id);
				}
				return parsed;
			})
			.filter(Boolean);
	}

	function applyWhere(records: any[], where: CleanedWhere[]) {
		if (!where || where.length === 0) return records;
		return records.filter((record) => {
			const andConditions: boolean[] = [];
			const orConditions: boolean[] = [];

			for (const clause of where) {
				const val = record[clause.field];
				const v = clause.value;
				let match = false;

				const isInsensitiveString =
					clause.mode === "insensitive" &&
					typeof val === "string" &&
					typeof v === "string";

				if (v === null) {
					match = clause.operator === "ne" ? val !== null : val === null;
				} else if (val instanceof Date && v instanceof Date) {
					const a = val.getTime();
					const b = v.getTime();
					switch (clause.operator) {
						case "gt":
							match = a > b;
							break;
						case "gte":
							match = a >= b;
							break;
						case "lt":
							match = a < b;
							break;
						case "lte":
							match = a <= b;
							break;
						default:
							match = a === b;
					}
				} else {
					switch (clause.operator) {
						case "contains":
							if (isInsensitiveString) {
								match = String(val || "")
									.toLowerCase()
									.includes(String(v).toLowerCase());
							} else {
								match = String(val || "").includes(String(v));
							}
							break;
						case "starts_with":
							if (isInsensitiveString) {
								match = String(val || "")
									.toLowerCase()
									.startsWith(String(v).toLowerCase());
							} else {
								match = String(val || "").startsWith(String(v));
							}
							break;
						case "ends_with":
							if (isInsensitiveString) {
								match = String(val || "")
									.toLowerCase()
									.endsWith(String(v).toLowerCase());
							} else {
								match = String(val || "").endsWith(String(v));
							}
							break;
						case "ne":
							if (isInsensitiveString) {
								match =
									String(val || "").toLowerCase() !== String(v).toLowerCase();
							} else {
								// Coerce to same type for comparison
								match = String(val) !== String(v);
							}
							break;
						case "gt":
							match = val > v;
							break;
						case "gte":
							match = val >= v;
							break;
						case "lt":
							match = val < v;
							break;
						case "lte":
							match = val <= v;
							break;
						case "in":
							if (
								clause.mode === "insensitive" &&
								typeof val === "string" &&
								Array.isArray(v)
							) {
								const normalizedArray = (v as any).map((item: any) =>
									String(item).toLowerCase(),
								);
								match = normalizedArray.includes(
									String(val || "").toLowerCase(),
								);
							} else if (Array.isArray(v)) {
								// Use string comparison for numeric IDs
								match = (v as any).some(
									(item: any) => String(item) === String(val),
								);
							} else {
								match = false;
							}
							break;
						case "not_in":
							if (
								clause.mode === "insensitive" &&
								typeof val === "string" &&
								Array.isArray(v)
							) {
								const normalizedArray = (v as any).map((item: any) =>
									String(item).toLowerCase(),
								);
								match = !normalizedArray.includes(
									String(val || "").toLowerCase(),
								);
							} else if (Array.isArray(v)) {
								// Use string comparison for numeric IDs
								match = !(v as any).some(
									(item: any) => String(item) === String(val),
								);
							} else {
								match = true;
							}
							break;
						default:
							if (isInsensitiveString) {
								match =
									String(val || "").toLowerCase() === String(v).toLowerCase();
							} else {
								// Coerce to same type for comparison (handles numeric IDs)
								match = String(val) === String(v);
							}
					}
				}

				if (clause.connector === "OR") orConditions.push(match);
				else andConditions.push(match);
			}

			const andResult = andConditions.length
				? andConditions.every(Boolean)
				: true;
			const orResult = orConditions.length ? orConditions.some(Boolean) : false;
			return orConditions.length > 0 ? orResult : andResult;
		});
	}

	function applySort(records: any[], sortBy: any) {
		if (!sortBy) return records;
		return [...records].sort((a, b) => {
			const aVal = a[sortBy.field];
			const bVal = b[sortBy.field];
			if (aVal < bVal) return sortBy.direction === "asc" ? -1 : 1;
			if (aVal > bVal) return sortBy.direction === "asc" ? 1 : -1;
			return 0;
		});
	}

	function applyJoin(
		base: any[],
		db: Record<string, any[]>,
		join?: JoinConfig,
	) {
		if (!join) return base;
		return base.map((record) => {
			const result = { ...record };
			for (const [joinModel, cfg] of Object.entries(join)) {
				const table = db[joinModel] || [];
				const matched = table.filter(
					(r) => r[cfg.on.to] === record[cfg.on.from],
				);

				// Apply limit to joined records (default is 100 per JoinConfig spec)
				const limit = cfg.limit ?? 100;
				if (cfg.relation === "one-to-one") {
					// For one-to-one, always just take first
					result[joinModel] = matched[0] || null;
				} else {
					// For one-to-many/many-to-many, apply limit
					result[joinModel] = matched.slice(0, limit);
				}
			}
			return result;
		});
	}

	const adapterCreator = createAdapterFactory({
		config: {
			adapterId: "redis",
			adapterName: "Redis Adapter",
			usePlural: false,
		},
		adapter: ({ getModelName }) => {
			return {
				async create({ model, data }) {
					await ensureConnection();
					const key = `${getModelName(model)}:${data.id}`;
					const dataToStore = { ...data };
					await client.set(
						key,
						JSON.stringify(dataToStore),
						ttl ? { EX: ttl } : undefined,
					);
					// Ensure ID is always returned, even if it's numeric
					return { ...dataToStore, id: String(dataToStore.id) };
				},
				async findOne({ model, where, select, join }) {
					const modelName = getModelName(model);
					const base = await loadModel(modelName);
					const filtered = applyWhere(base, where);
					if (!filtered.length) return null;

					const db: Record<string, any[]> = { [modelName]: base };
					if (join) {
						for (const joinKey in join) {
							db[joinKey] = await loadModel(getModelName(joinKey));
						}
					}

					const joined = applyJoin(filtered, db, join);
					// Don't filter by select here - let transformOutput in the core handle it
					return joined[0] || null;
				},
				async findMany({ model, where, sortBy, limit, offset, select, join }) {
					const modelName = getModelName(model);
					const base = await loadModel(modelName);
					let res = applyWhere(base, where || []);
					res = applySort(res, sortBy);

					if (offset !== undefined) res = res.slice(offset);
					if (limit !== undefined) res = res.slice(0, limit);

					const db: Record<string, any[]> = { [modelName]: base };
					if (join) {
						for (const joinKey in join) {
							db[joinKey] = await loadModel(getModelName(joinKey));
						}
					}

					const joined = applyJoin(res, db, join);
					// Don't filter by select here - let transformOutput in the core handle it
					return joined;
				},
				async count({ model, where }) {
					const records = await loadModel(getModelName(model));
					return applyWhere(records, where || []).length;
				},
				async update({ model, where, update }) {
					const modelName = getModelName(model);
					const records = await loadModel(modelName);
					const filtered = applyWhere(records, where);
					if (!filtered.length) return null;

					for (const r of filtered) {
						const updated = { ...r, ...update };
						await client.set(
							`${modelName}:${r.id}`,
							JSON.stringify(updated),
							ttl ? { EX: ttl } : undefined,
						);
					}
					const result = { ...filtered[0], ...update };
					// Ensure ID is always returned as string
					return { ...result, id: String(result.id) };
				},
				async updateMany({ model, where, update }) {
					const modelName = getModelName(model);
					const records = await loadModel(modelName);
					const filtered = applyWhere(records, where || []);
					for (const r of filtered) {
						const updated = { ...r, ...update };
						await client.set(
							`${modelName}:${r.id}`,
							JSON.stringify(updated),
							ttl ? { EX: ttl } : undefined,
						);
					}
					return filtered.length;
				},
				async delete({ model, where }) {
					const modelName = getModelName(model);
					const records = await loadModel(modelName);
					const filtered = applyWhere(records, where);
					for (const r of filtered) {
						await client.del(`${modelName}:${r.id}`);
					}
				},
				async deleteMany({ model, where }) {
					const modelName = getModelName(model);
					const records = await loadModel(modelName);
					const filtered = applyWhere(records, where || []);
					for (const r of filtered) {
						await client.del(`${modelName}:${r.id}`);
					}
					return filtered.length;
				},
			};
		},
	});

	return adapterCreator;
};
