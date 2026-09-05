import * as z from "zod";
import { BetterAuthError } from "../../error";
import type { CleanedWhere, CustomAdapter } from "./index";

const MAX_ATTEMPTS = 5;

const scalar = z
	.union([z.string(), z.number(), z.boolean(), z.date()])
	.nullable();
const rowSchema = z.record(z.string(), scalar.optional());
const readSchema = rowSchema.nullable();
const idSchema = z.union([z.string(), z.number()]);
const setSchema = z
	.record(z.string(), scalar.optional())
	.transform((values) => {
		const assignments: Record<string, z.output<typeof scalar>> = {};
		for (const [field, value] of Object.entries(values)) {
			if (value !== undefined) assignments[field] = value;
		}
		return assignments;
	});
const mutationSchema = z.object({
	increment: z.record(z.string(), z.number()),
	set: setSchema.optional(),
});
const counterSchema = z.number().nullish();

type StoredRow = z.output<typeof rowSchema>;

type FallbackOptions = {
	adapter: CustomAdapter;
	adapterId: string;
	model: string;
	idField: string;
	where: CleanedWhere[];
};

async function readRow({
	adapter,
	adapterId,
	model,
	where,
	idField,
}: FallbackOptions): Promise<StoredRow | null> {
	const result = readSchema.safeParse(
		await adapter.findOne<unknown>({ model, where }),
	);
	if (!result.success) {
		throw new BetterAuthError(
			`Adapter "${adapterId}" must return a scalar row snapshot or null. Implement native atomic methods for non-scalar values.`,
		);
	}
	const row = result.data;
	if (row === null) return null;
	if (!idSchema.safeParse(row[idField]).success) {
		throw new BetterAuthError(
			`Adapter "${adapterId}" must return the row id for atomic fallbacks.`,
		);
	}
	return row;
}

function snapshotGuard(
	row: StoredRow,
	fields: readonly string[],
): CleanedWhere[] {
	const keys = new Set([...Object.keys(row), ...fields]);
	return Array.from(keys, (field) => ({
		field,
		value: row[field] ?? null,
		operator: "eq",
		connector: "AND",
		mode: "sensitive",
	}));
}

function changedOne(count: number, adapterId: string): boolean {
	if (count !== 0 && count !== 1) {
		throw new BetterAuthError(
			`Adapter "${adapterId}" must return an affected row count of 0 or 1 from an atomic fallback.`,
		);
	}
	return count === 1;
}

export async function consumeOneFallback(
	options: FallbackOptions,
): Promise<StoredRow | null> {
	const { adapter, adapterId, model, where } = options;
	const row = await readRow(options);
	if (row === null) return null;
	// Guard the selected snapshot with AND predicates, without widening an OR selector.
	const guard = snapshotGuard(
		row,
		where.map(({ field }) => field),
	);
	const count = await adapter.deleteMany({ model, where: guard });
	return changedOne(count, adapterId) ? row : null;
}

export async function incrementOneFallback(
	options: FallbackOptions & {
		increment: Record<string, number>;
		set?: Record<string, unknown> | undefined;
	},
): Promise<StoredRow | null> {
	const { adapter, adapterId, model, where } = options;
	const mutation = mutationSchema.safeParse(options);
	if (!mutation.success) {
		throw new BetterAuthError(
			`Adapter "${adapterId}" requires finite increments and scalar set values for the atomic fallback.`,
		);
	}
	const { increment, set } = mutation.data;
	const deltas = Object.entries(increment);
	const fields = [
		...where.map(({ field }) => field),
		...Object.keys(increment),
		...Object.keys(set ?? {}),
	];
	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const row = await readRow(options);
		if (row === null) return null;
		const update: z.output<typeof setSchema> = { ...set };
		for (const [field, delta] of deltas) {
			const previous = counterSchema.safeParse(row[field]);
			if (!previous.success) {
				throw new BetterAuthError(
					`Adapter "${adapterId}" must return finite numeric counter values or null for atomic increments.`,
				);
			}
			const current = previous.data ?? 0;
			const next = current + delta;
			if (!Number.isFinite(next) || (delta !== 0 && next === current)) {
				throw new BetterAuthError(
					`Adapter "${adapterId}" cannot represent the requested counter increment safely.`,
				);
			}
			update[field] = next;
		}
		// A no-op can finish at the read, including stores reporting changed rows.
		if (
			Object.entries(update).every(([field, value]) => {
				const previous = row[field];
				if (previous instanceof Date && value instanceof Date) {
					return previous.getTime() === value.getTime();
				}
				return Object.is(previous, value);
			})
		)
			return row;
		const count = await adapter.updateMany({
			model,
			where: snapshotGuard(row, fields),
			update,
		});
		if (changedOne(count, adapterId)) {
			// A second read could observe another writer's result instead of ours.
			return { ...row, ...update };
		}
	}
	throw new BetterAuthError(
		`Adapter "${adapterId}" could not complete an atomic increment due to contention. Retry the operation or implement incrementOne natively.`,
	);
}
