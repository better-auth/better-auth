import {
	createAdapter,
	type AdapterDebugLogs,
	type CleanedWhere,
} from "../create-adapter";

export interface PouchDBAdapterConfig {
	debugLogs?: AdapterDebugLogs;
}

export const pouchdbAdapter = (
	db: PouchDB.Database,
	config?: PouchDBAdapterConfig,
) =>
	createAdapter({
		config: {
			adapterId: "pouchdb",
			adapterName: "PouchDB Adapter",
			usePlural: false,
			debugLogs: config?.debugLogs || false,
			supportsJSON: true,
			supportsDates: false,
			supportsBooleans: true,
			supportsNumericIds: false,
			customIdGenerator: ({ model }) => {
				return `${model}:${Date.now()}${Math.floor(Math.random() * 1000000)}`;
			},
			mapKeysTransformOutput: {
				_id: "id",
			},
			mapKeysTransformInput: {
				id: "_id",
			},
		},
		adapter: ({ getFieldName }) => {
			function convertWhereClause(
				where: CleanedWhere[],
				model: string,
			): PouchDB.Find.Selector {
				if (!where.length) return {};
				const conditions = where.map((w) => {
					const {
						field: _field,
						value,
						operator = "eq",
						connector = "AND",
					} = w;
					// Todo: handle this when Where is being "Cleaned" in createAdapter
					const field =
						getFieldName({ model, field: _field }) === "id"
							? "_id"
							: getFieldName({ model, field: _field });
					let condition: any;
					switch (operator.toLowerCase()) {
						case "eq":
							condition = {
								[field]: value,
							};
							break;
						case "in":
							condition = {
								[field]: {
									$in: Array.isArray(value) ? value : [value],
								},
							};
							break;
						case "gt":
							condition = { [field]: { $gt: value } };
							break;
						case "gte":
							condition = { [field]: { $gte: value } };
							break;
						case "lt":
							condition = { [field]: { $lt: value } };
							break;
						case "lte":
							condition = { [field]: { $lte: value } };
							break;
						case "ne":
							condition = { [field]: { $ne: value } };
							break;
						case "contains":
							condition = { [field]: { $regex: `.*${value}.*` } };
							break;
						case "starts_with":
							condition = { [field]: { $regex: `${value}.*` } };
							break;
						case "ends_with":
							condition = { [field]: { $regex: `.*${value}` } };
							break;
						default:
							throw new Error(`Unsupported operator: ${operator}`);
					}
					return { condition, connector };
				});
				if (conditions.length === 1) {
					return conditions[0].condition;
				}
				const andConditions = conditions
					.filter((c) => c.connector === "AND")
					.map((c) => c.condition);
				const orConditions = conditions
					.filter((c) => c.connector === "OR")
					.map((c) => c.condition);

				let clause = {};
				if (andConditions.length) {
					clause = { ...clause, $and: andConditions };
				}
				if (orConditions.length) {
					clause = { ...clause, $or: orConditions };
				}
				return clause;
			}
			async function createQuery({
				model,
				where,
				limit,
				offset,
				sortBy,
			}: {
				model: string;
				where?: CleanedWhere[];
				limit?: number;
				offset?: number;
				sortBy?: { field: string; direction: "asc" | "desc" };
			}): Promise<PouchDB.Find.FindRequest<{}>> {
				const clause = where ? convertWhereClause(where, model) : {};
				let selector = {
					_id: { $gt: `${model}:` },
					...clause,
				} as PouchDB.Find.Selector;
				let sort: PouchDB.Find.FindRequest<{}>["sort"] = undefined;
				if (sortBy) {
					// if index doesn't exist, create it
					await db.createIndex({
						index: {
							fields: [getFieldName({ model, field: sortBy.field })],
						},
					});
					selector[getFieldName({ model, field: sortBy.field })] = { $gt: "" };
					sort = [
						{
							[getFieldName({ model, field: sortBy.field })]:
								sortBy.direction === "desc" ? "desc" : "asc",
						},
					];
				}
				return {
					selector,
					sort,
					limit: limit || Infinity,
					skip: offset || 0,
				};
			}
			return {
				create: async ({ data }) => {
					const res = await db.put(data);
					if (!res.ok) {
						throw new Error("Failed to create document");
					}
					return { id: res.id, ...data };
				},
				findOne: async <T>({
					model,
					where,
				}: { model: string; where: CleanedWhere[] }): Promise<T | null> => {
					const query = await createQuery({ model, where, limit: 1 });
					const res = await db.find(query);
					if (!res.docs.length) return null;
					return res.docs[0] as T;
				},
				findMany: async <T>({
					model,
					where,
					sortBy,
					limit,
					offset,
				}: {
					model: string;
					where?: CleanedWhere[];
					sortBy?: { field: string; direction: "asc" | "desc" };
					limit?: number;
					offset?: number;
				}): Promise<T[]> => {
					const query = await createQuery({
						model,
						where,
						limit,
						offset,
						sortBy,
					});
					const res = await db.find(query);
					return res.docs as T[];
				},
				count: async ({ model }) => {
					return db
						.allDocs({ startkey: `${model}:`, endkey: `${model}:\ufff0` })
						.then((res) => {
							return res.total_rows;
						});
				},
				update: async ({ model, where, update }) => {
					const queryResult = await db.find(
						await createQuery({ model, where, limit: 1 }),
					);
					const doc = queryResult.docs[0];
					const updatedDoc = { ...doc, ...update };
					const res = await db.put(updatedDoc);
					if (!res.ok) {
						throw new Error("Failed to update document");
					}
					return updatedDoc;
				},
				delete: async ({ model, where }) => {
					const queryResult = await db.find(
						await createQuery({ model, where, limit: 1 }),
					);
					if (!queryResult.docs.length) return;
					const doc = queryResult.docs[0];
					const res = await db.remove(doc._id, doc._rev);
					if (!res.ok) {
						throw new Error("Failed to delete document");
					}
				},
				deleteMany: async ({ model, where }) => {
					const queryResult = await db.find(
						await createQuery({ model, where }),
					);
					const docs = queryResult.docs;
					const res = await db.bulkDocs(
						docs.map((doc) => ({ ...doc, _deleted: true })),
					);
					return res.length;
				},
				updateMany: async ({ model, where, update }) => {
					const query = await createQuery({ model, where });
					const queryResult = await db.find(query);
					const docs = queryResult.docs;
					const res = await db.bulkDocs(
						docs.map((doc) => ({ ...doc, ...update })),
					);
					return res.length;
				},
			};
		},
	});
