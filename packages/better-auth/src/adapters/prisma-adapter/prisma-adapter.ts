import { BetterAuthError } from "../../error";
import type { Where, Join } from "../../types";
import { createAdapter, type AdapterDebugLogs } from "../create-adapter";

export interface PrismaConfig {
	/**
	 * Database provider.
	 */
	provider:
		| "sqlite"
		| "cockroachdb"
		| "mysql"
		| "postgresql"
		| "sqlserver"
		| "mongodb";

	/**
	 * Enable debug logs for the adapter
	 *
	 * @default false
	 */
	debugLogs?: AdapterDebugLogs;

	/**
	 * Use plural table names
	 *
	 * @default false
	 */
	usePlural?: boolean;
}

interface PrismaClient {}

interface PrismaClientInternal {
	[model: string]: {
		create: (data: any) => Promise<any>;
		findFirst: (data: any) => Promise<any>;
		findMany: (data: any) => Promise<any>;
		update: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
}

export const prismaAdapter = (prisma: PrismaClient, config: PrismaConfig) =>
	createAdapter({
		config: {
			adapterId: "prisma",
			adapterName: "Prisma Adapter",
			usePlural: config.usePlural ?? false,
			debugLogs: config.debugLogs ?? false,
		},
		adapter: ({ getFieldName }) => {
			const db = prisma as PrismaClientInternal;

			const convertSelect = (select?: string[], model?: string) => {
				if (!select || !model) return undefined;
				return select.reduce((prev, cur) => {
					return {
						...prev,
						[getFieldName({ model, field: cur })]: true,
					};
				}, {});
			};
			function operatorToPrismaOperator(operator: string) {
				switch (operator) {
					case "starts_with":
						return "startsWith";
					case "ends_with":
						return "endsWith";
					case "ne":
						return "not";
					case "not_in":
						return "notIn";
					default:
						return operator;
				}
			}
			const buildIncludeFromJoins = (joins?: Join[]) => {
				if (!joins || joins.length === 0) return undefined;

				const include: any = {};
				for (const join of joins) {
					const joinName = join.alias || join.table;
					// Prisma uses relation names, which may differ from table names
					// For simplicity, we assume the relation name matches the table name
					// In real implementations, this would need proper relation mapping
					include[joinName] =
						join.select && join.select.length > 0
							? {
									select: join.select.reduce(
										(acc, field) => ({ ...acc, [field]: true }),
										{},
									),
								}
							: true;
				}
				return include;
			};

			const flattenJoinedResult = (result: any, joins?: Join[]) => {
				if (!joins || joins.length === 0 || !result) return result;

				const flattened = { ...result };
				for (const join of joins) {
					const joinName = join.alias || join.table;
					const joinedData = result[joinName];

					if (joinedData) {
						// Flatten joined data with prefixed field names
						if (Array.isArray(joinedData)) {
							// Take first item for JOIN behavior (Prisma relations can be arrays)
							const firstItem = joinedData[0];
							if (firstItem) {
								for (const [key, value] of Object.entries(firstItem)) {
									flattened[`${joinName}_${key}`] = value;
								}
							}
						} else {
							// Single joined object
							for (const [key, value] of Object.entries(joinedData)) {
								flattened[`${joinName}_${key}`] = value;
							}
						}
					} else {
						// No joined data (left join with no match) - add null fields
						if (join.select && join.select.length > 0) {
							for (const field of join.select) {
								flattened[`${joinName}_${field}`] = null;
							}
						}
					}

					// Remove the original nested object
					delete flattened[joinName];
				}

				return flattened;
			};

			const convertWhereClause = (
				model: string,
				where?: Where[],
				joins?: Join[],
			) => {
				if (!where) return {};

				// Helper to resolve field references
				const resolveFieldRef = (fieldRef: string) => {
					if (fieldRef.includes(".")) {
						const [tableName, fieldName] = fieldRef.split(".");
						if (tableName === model) {
							// Main table field
							return { [getFieldName({ model, field: fieldName })]: true };
						} else {
							// Joined table field - use Prisma nested field syntax
							const joinName =
								joins?.find((j) => (j.alias || j.table) === tableName)?.alias ||
								tableName;
							return { [joinName]: { [fieldName]: true } };
						}
					} else {
						// Simple field name, use main table
						return { [getFieldName({ model, field: fieldRef })]: true };
					}
				};

				if (where.length === 1) {
					const w = where[0];
					if (!w) {
						return;
					}

					// Handle joined field references
					if (w.field.includes(".")) {
						const [tableName, fieldName] = w.field.split(".");
						if (tableName !== model) {
							// This is a joined table field - use Prisma nested where
							const joinName =
								joins?.find((j) => (j.alias || j.table) === tableName)?.alias ||
								tableName;
							return {
								[joinName]: {
									[fieldName]:
										w.operator === "eq" || !w.operator
											? w.value
											: {
													[operatorToPrismaOperator(w.operator)]: w.value,
												},
								},
							};
						}
					}

					return {
						[getFieldName({ model, field: w.field })]:
							w.operator === "eq" || !w.operator
								? w.value
								: {
										[operatorToPrismaOperator(w.operator)]: w.value,
									},
					};
				}
				const and = where.filter((w) => w.connector === "AND" || !w.connector);
				const or = where.filter((w) => w.connector === "OR");
				const andClause = and.map((w) => {
					// Handle joined field references
					if (w.field.includes(".")) {
						const [tableName, fieldName] = w.field.split(".");
						if (tableName !== model) {
							const joinName =
								joins?.find((j) => (j.alias || j.table) === tableName)?.alias ||
								tableName;
							return {
								[joinName]: {
									[fieldName]:
										w.operator === "eq" || !w.operator
											? w.value
											: {
													[operatorToPrismaOperator(w.operator)]: w.value,
												},
								},
							};
						}
					}

					return {
						[getFieldName({ model, field: w.field })]:
							w.operator === "eq" || !w.operator
								? w.value
								: {
										[operatorToPrismaOperator(w.operator)]: w.value,
									},
					};
				});
				const orClause = or.map((w) => {
					// Handle joined field references
					if (w.field.includes(".")) {
						const [tableName, fieldName] = w.field.split(".");
						if (tableName !== model) {
							const joinName =
								joins?.find((j) => (j.alias || j.table) === tableName)?.alias ||
								tableName;
							return {
								[joinName]: {
									[fieldName]:
										w.operator === "eq" || !w.operator
											? w.value
											: {
													[operatorToPrismaOperator(w.operator)]: w.value,
												},
								},
							};
						}
					}

					return {
						[getFieldName({ model, field: w.field })]:
							w.operator === "eq" || !w.operator
								? w.value
								: {
										[operatorToPrismaOperator(w.operator)]: w.value,
									},
					};
				});

				return {
					...(andClause.length ? { AND: andClause } : {}),
					...(orClause.length ? { OR: orClause } : {}),
				};
			};

			return {
				async create({ model, data: values, select }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					return await db[model].create({
						data: values,
						select: convertSelect(select, model),
					});
				},
				async findOne({ model, where, select, joins }) {
					const whereClause = convertWhereClause(model, where, joins);
					const include = buildIncludeFromJoins(joins);

					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					const findOptions: any = {
						where: whereClause,
						select: convertSelect(select, model),
						...(include && { include }),
					};

					const result = await db[model].findFirst(findOptions);

					return result ? flattenJoinedResult(result, joins) : null;
				},
				async findMany({ model, where, limit, offset, sortBy, joins }) {
					const whereClause = convertWhereClause(model, where, joins);
					const include = buildIncludeFromJoins(joins);

					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					const findOptions: any = {
						where: whereClause,
						take: limit || 100,
						skip: offset || 0,
						...(include && { include }),
						...(sortBy?.field
							? {
									orderBy: {
										[getFieldName({ model, field: sortBy.field })]:
											sortBy.direction === "desc" ? "desc" : "asc",
									},
								}
							: {}),
					};

					const results = await db[model].findMany(findOptions);

					return results.map((result: any) =>
						flattenJoinedResult(result, joins),
					) as any[];
				},
				async count({ model, where, joins }) {
					const whereClause = convertWhereClause(model, where, joins);

					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}

					// For joins in count, we need to use findMany and count the results
					// since Prisma count doesn't support include/joins directly
					if (joins && joins.length > 0) {
						const include = buildIncludeFromJoins(joins);
						const results = await db[model].findMany({
							where: whereClause,
							include,
						});
						return results.length;
					}

					return await db[model].count({
						where: whereClause,
					});
				},
				async update({ model, where, update }) {
					if (!db[model]) {
						throw new BetterAuthError(
							`Model ${model} does not exist in the database. If you haven't generated the Prisma client, you need to run 'npx prisma generate'`,
						);
					}
					const whereClause = convertWhereClause(model, where);
					return await db[model].update({
						where: whereClause,
						data: update,
					});
				},
				async updateMany({ model, where, update }) {
					const whereClause = convertWhereClause(model, where);
					const result = await db[model].updateMany({
						where: whereClause,
						data: update,
					});
					return result ? (result.count as number) : 0;
				},
				async delete({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					try {
						await db[model].delete({
							where: whereClause,
						});
					} catch (e) {
						// If the record doesn't exist, we don't want to throw an error
					}
				},
				async deleteMany({ model, where }) {
					const whereClause = convertWhereClause(model, where);
					const result = await db[model].deleteMany({
						where: whereClause,
					});
					return result ? (result.count as number) : 0;
				},
				options: config,
			};
		},
	});
