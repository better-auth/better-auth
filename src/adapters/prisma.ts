import type { Adapter, SessionAdapter, Where } from "./types";

function whereConvertor(where?: Where[]) {
	if (!where) return {};
	if (where.length === 1) {
		const w = where[0];
		if (!w) {
			return;
		}
		return {
			[w.field]: w.value,
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
							[w.operator]: w.value,
						},
		};
	});
	const orClause = or.map((w) => {
		return {
			[w.field]: w.operator
				? {
						[w.operator]: w.value,
					}
				: w.value,
		};
	});
	const clause: {
		AND?: any[];
		OR?: any[];
	} = {};

	if (andClause.length) {
		clause.AND = andClause;
	}
	if (orClause.length) {
		clause.OR = orClause;
	}
	return clause;
}

export const prismaAdapter = <T extends {}>(db: T): Adapter => {
	return {
		async create(data) {
			const { model, data: val, select } = data;

			//@ts-expect-error
			const res = await db[model].create({
				data: val,
				...(select?.length
					? {
							select: select.reduce(
								(prev, cur) => {
									prev[cur] = true;
									return prev;
								},
								{} as Record<string, boolean>,
							),
						}
					: {}),
			});
			return res;
		},
		async findOne(data) {
			const { model, where, select } = data;
			const whereClause = whereConvertor(where);
			//@ts-expect-error
			return await db[model].findFirst({
				where: whereClause,
				...(select?.length
					? {
							select: select.reduce(
								(prev, cur) => {
									prev[cur] = true;
									return prev;
								},
								{} as Record<string, boolean>,
							),
						}
					: {}),
			});
		},
		async findMany(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);
			//@ts-expect-error
			return await db[model].findMany({ where: whereClause });
		},
		async update(data) {
			const { model, where, update } = data;
			const whereClause = whereConvertor(where);
			//@ts-expect-error
			return await db[model].update({
				where: whereClause,
				data: update,
			});
		},
		async delete(data) {
			const { model, where } = data;
			const whereClause = whereConvertor(where);
			//@ts-expect-error
			return await db[model].delete({ where: whereClause });
		},
		config: {
			dateFormat: "date",
			failsOnRecordExist: true,
		},
	};
};

export const prismaSessionAdapter = <T extends {}>(db: T): SessionAdapter => {
	return {
		async create(data) {
			const { userId, expiresAt } = data;
			//@ts-expect-error
			const res = await db.session.create({
				data: {
					userId,
					expiresAt,
				},
			});
			return res;
		},
		async findOne(data) {
			const { userId } = data;
			//@ts-expect-error
			return await db.session.findFirst({
				where: {
					userId,
				},
			});
		},
		async update(data) {
			const { id, userId, expiresAt } = data;
			//@ts-expect-error
			const res = await db.session.update({
				where: {
					id,
				},
				data: {
					userId,
					expiresAt,
				},
			});
			return res;
		},
		async delete(data) {
			const { sessionId } = data;
			//@ts-expect-error
			await db.session.delete({
				where: {
					id: sessionId,
				},
			});
		},
	};
};
