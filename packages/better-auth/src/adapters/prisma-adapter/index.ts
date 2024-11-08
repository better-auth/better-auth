import type { Adapter, Where } from "../../types";

function operatorToPrismaOperator(operator: string) {
	switch (operator) {
		case "starts_with":
			return "startsWith";
		case "ends_with":
			return "endsWith";
		default:
			return operator;
	}
}

function whereConvertor(where?: Where[]) {
	if (!where) return {};
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return;
		}

		return {
			[w.field]:
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
		return {
			[w.field]:
				w.operator === "eq" || !w.operator
					? w.value
					: {
							[operatorToPrismaOperator(w.operator)]: w.value,
						},
		};
	});
	const orClause = or.map((w) => {
		return {
			[w.field]: {
				[w.operator || "eq"]: w.value,
			},
		};
	});

	return {
		AND: andClause.length ? andClause : undefined,
		OR: orClause.length ? orClause : undefined,
	};
}

interface PrismaClient {
	[model: string]: {
		create: (data: any) => Promise<any>;
		findFirst: (data: any) => Promise<any>;
		findMany: (data: any) => Promise<any>;
		update: (data: any) => Promise<any>;
		delete: (data: any) => Promise<any>;
		[key: string]: any;
	};
}

export const prismaAdapter = (
	prisma: any,
	options: {
		provider:
			| "sqlite"
			| "cockroachdb"
			| "mysql"
			| "postgresql"
			| "sqlserver"
			| "mongodb";
		/**
		 * Custom generateId function.
		 *
		 * If not provided, nanoid will be used.
		 * If set to false, the database's auto generated id will be used.
		 *
		 * @default nanoid
		 */
		generateId?: ((size?: number) => string) | false;
	},
): Adapter => {
	const db: PrismaClient = prisma;
	const generateId = options.generateId;
	return {
		id: "prisma",
		async create(data) {
			const { model, data: val, select } = data;
			if (generateId !== undefined) {
				val.id = generateId ? generateId() : undefined;
			}
			return await db[model].create({
				data: val,
				...(select?.length
					? {
							select: select.reduce((prev, cur) => {
								return {
									...prev,
									[cur]: true,
								};
							}, {}),
						}
					: {}),
			});
		},
		async findOne(data) {
			const { model, where, select } = data;
			const whereClause = whereConvertor(where);

			return await db[model].findFirst({
				where: whereClause,
				...(select?.length
					? {
							select: select.reduce((prev, cur) => {
								return {
									...prev,
									[cur]: true,
								};
							}, {}),
						}
					: {}),
			});
		},
		async findMany(data) {
			const { model, where, limit, offset, sortBy } = data;

			const whereClause = whereConvertor(where);

			return await db[model].findMany({
				where: whereClause,
				take: limit || 100,
				skip: offset || 0,
				orderBy: sortBy?.field
					? {
							[sortBy.field]: sortBy.direction === "desc" ? "desc" : "asc",
						}
					: undefined,
			});
		},
		async update(data) {
			const { model, where, update } = data;
			if (update.id) {
				update.id = undefined;
			}
			const whereClause = whereConvertor(where);
			if (!whereClause) {
				throw new Error("Where clause is required for update");
			}
			if (where.length === 1 && where[0].field === "id") {
				return await db[model].update({
					where: whereClause,
					data: update,
				});
			}
			return await db[model].updateMany({
				where: whereClause,
				data: update,
			});
		},
		async delete(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);

			return await db[model].delete({ where: whereClause }).catch((e) => {
				//handle delete gracefully (if not found)
			});
		},
		async deleteMany(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);

			return await db[model].deleteMany({ where: whereClause });
		},
		options,
	};
};
