import type { BetterAuthOptions } from "@better-auth/core";
import type { CleanedWhere, JoinConfig } from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import type { RedisClientType } from "redis";

/**
 * Configuration for the Redis adapter.
 */
export interface RedisAdapterConfig {
	/**
	 * Redis client instance
	 */
	client: RedisClientType;
	/**
	 * Time to live for keys in seconds
	 *
	 * @default undefined
	 */
	ttl?: number;
}

// Module-level tracking of max IDs per model for serial ID generation
// Persists across adapter instances within the same Redis client
const MAX_IDS: Record<string, Record<string, number>> = {};

export const redisAdapter = (config: RedisAdapterConfig) => {
	const client = config.client;
	const ttl = config.ttl;

	let connecting: Promise<any> | null = null;

	// Persist ID counters across adapter instances for the same client connection
	const clientKey =
		typeof client === "object" ? JSON.stringify(client) : String(client);
	if (!MAX_IDS[clientKey]) {
		MAX_IDS[clientKey] = {};
	}
	const maxIds = MAX_IDS[clientKey];

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

		if (keys.length === 0) {
			maxIds[model] = 0;
			return [];
		}

		const mgetRes = await client.mGet(keys);

		const records = mgetRes
			.map((val) => {
				const parsed = safeParse(val);
				if (!parsed) return null;
				if (parsed.id !== undefined && parsed.id !== null) {
					parsed.id = String(parsed.id);
				}
				return parsed;
			})
			.filter(Boolean);

		// Track max ID for serial ID generation
		const maxId = Math.max(
			...records
				.map((r) => {
					const id = r.id;
					const numId = Number(id);
					return isNaN(numId) ? 0 : numId;
				})
				.filter((id) => id > 0),
		);
		maxIds[model] = Math.max(maxId, 0);

		return records;
	}

	function applyWhere(records: any[], where: CleanedWhere[]) {
		if (!where || where.length === 0) return records;
		const filtered = records.filter((record) => {
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

			// Handle combined AND/OR conditions
			if (orConditions.length === 0) {
				return andResult;
			} else if (andConditions.length === 0) {
				return orResult;
			} else {
				return andResult && orResult;
			}
		});
		return filtered;
	}

	function applySort(records: any[], sortBy: any) {
		if (!sortBy) return records;
		return [...records].sort((a, b) => {
			const aVal = a[sortBy.field];
			const bVal = b[sortBy.field];

			if (aVal === null || aVal === undefined) return 1;
			if (bVal === null || bVal === undefined) return -1;

			if (typeof aVal === "string") {
				return sortBy.direction === "desc"
					? bVal.localeCompare(aVal)
					: aVal.localeCompare(bVal);
			}

			return sortBy.direction === "desc" ? bVal - aVal : aVal - bVal;
		});
	}

	function applyJoin(
		records: any[],
		db: Record<string, any[]>,
		join?: JoinConfig,
	) {
		if (!join) return records;

		return records.map((record) => {
			const result = { ...record };

			for (const [joinModel, joinAttr] of Object.entries(
				join as Record<string, any>,
			)) {
				if (!joinAttr) continue;

				const joinTable = db[joinModel];
				if (!joinTable) continue;

				const matchingRecords = joinTable.filter(
					(joinRecord: any) =>
						String(joinRecord[joinAttr.on.to]) ===
						String(record[joinAttr.on.from]),
				);

				if (joinAttr.relation === "one-to-one") {
					result[joinModel] = matchingRecords[0] || null;
				} else {
					const limit = joinAttr.limit ?? 100;
					result[joinModel] = matchingRecords.slice(0, limit);
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
			customTransformInput(props: {
				options: BetterAuthOptions;
				field: string;
				action: string;
				model: string;
				data: any;
			}) {
				const useNumberId =
					props.options.advanced?.database?.generateId === "serial";
				if (useNumberId && props.field === "id" && props.action === "create") {
					const currentMax = maxIds[props.model] || 0;
					maxIds[props.model] = currentMax + 1;
					return maxIds[props.model];
				}
				return props.data;
			},
		},
		adapter: ({
			getModelName,
			options,
		}: {
			getModelName: (model: string) => string;
			options: BetterAuthOptions;
		}) => {
			return {
				async create({ model, data }) {
					await ensureConnection();
					const finalData: any = { ...data };
					const useNumberId =
						options.advanced?.database?.generateId === "serial";
					if (
						useNumberId &&
						(finalData.id === undefined || finalData.id === null)
					) {
						const currentMax = maxIds[model] || 0;
						maxIds[model] = currentMax + 1;
						finalData.id = String(maxIds[model]);
					}
					const normalizedData = { ...finalData, id: String(finalData.id) };
					const key = `${getModelName(model)}:${normalizedData.id}`;
					await client.set(
						key,
						JSON.stringify(normalizedData),
						ttl ? { EX: ttl } : undefined,
					);
					return normalizedData;
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
						const updated = { ...r, ...update, id: String(r.id) };
						await client.set(
							`${modelName}:${r.id}`,
							JSON.stringify(updated),
							ttl ? { EX: ttl } : undefined,
						);
					}
					const result = { ...filtered[0], ...update };
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
				createSchema: async () => ({
					code: "",
					path: "",
				}),
			};
		},
	});

	return adapterCreator;
};
