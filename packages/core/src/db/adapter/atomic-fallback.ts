import * as z from "zod";
import { BetterAuthError } from "../../error";
import type { CleanedWhere, CustomAdapter, Where } from "./index";

const MAX_ATTEMPTS = 5;

const scalar = z
	.union([z.string(), z.number(), z.boolean(), z.date()])
	.nullable();
const rowSchema = z.record(z.string(), z.unknown());
const readSchema = rowSchema.nullish();
const setSchema = z.record(z.string(), z.unknown()).transform((values) => {
	const assignments: z.output<typeof rowSchema> = {};
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

type FallbackContext = {
	adapter: CustomAdapter;
	adapterId: string;
	mapKeysTransformInput?: Record<string, string> | undefined;
	mapKeysTransformOutput?: Record<string, string> | undefined;
	getFieldName: (input: { model: string; field: string }) => string;
	transformOutput: (
		row: StoredRow,
		model: string,
		select: string[],
		join: undefined,
	) => Promise<{ id?: unknown } | null>;
	transformWhereClause: (input: {
		model: string;
		where: Where[];
		action: "consumeOne" | "incrementOne";
	}) => CleanedWhere[];
};

type FallbackRequest = {
	model: string;
	logicalModel: string;
	where: CleanedWhere[];
};

// Read a snapshot, then conditionally mutate it. A write succeeds only when
// an adapter checks and mutates atomically and reports exactly one affected row.
export function createAtomicFallbacks(context: FallbackContext) {
	const { adapter, adapterId } = context;
	const outputId =
		Object.entries(context.mapKeysTransformOutput ?? {}).find(
			([, field]) => field === "id",
		)?.[0] ?? "id";
	async function idWhere(
		row: StoredRow,
		model: string,
		action: "consumeOne" | "incrementOne",
	): Promise<CleanedWhere> {
		const mappedId =
			context.mapKeysTransformInput?.id ||
			context.getFieldName({ model, field: "id" });
		if (row[mappedId] === undefined || row[mappedId] === null) {
			throw new BetterAuthError(
				`Adapter "${context.adapterId}" must return the row id for atomic fallbacks.`,
			);
		}
		const output = await context.transformOutput(
			row,
			model,
			[outputId],
			undefined,
		);
		const id = output?.id;
		if (typeof id !== "string" && typeof id !== "number") {
			throw new BetterAuthError(
				`Adapter "${context.adapterId}" must expose a logical string or number id through its output transform.`,
			);
		}
		const [condition] = context.transformWhereClause({
			model,
			where: [{ field: "id", value: id }],
			action,
		});
		if (!condition)
			throw new BetterAuthError(
				"The atomic fallback id condition was transformed away.",
			);
		return condition;
	}
	async function readRow({
		model,
		where,
	}: FallbackRequest): Promise<StoredRow | null> {
		const result = readSchema.safeParse(
			await adapter.findOne<unknown>({ model, where }),
		);
		if (!result.success) {
			throw new BetterAuthError(
				`Adapter "${adapterId}" must return a row snapshot or null.`,
			);
		}
		return result.data ?? null;
	}

	async function snapshotGuard(
		row: StoredRow,
		fields: readonly string[],
		request: FallbackRequest,
		action: "consumeOne" | "incrementOne",
	): Promise<CleanedWhere[]> {
		const id = await idWhere(row, request.logicalModel, action);
		const hasOr = request.where.some((clause) => clause.connector === "OR");
		const guard: CleanedWhere[] = hasOr ? [id] : [...request.where, id];
		const keys = new Set(fields);
		for (const field of keys) {
			if (field === id.field) continue;
			const value = scalar.safeParse(row[field] ?? null);
			if (!value.success) {
				if (hasOr && request.where.some((clause) => clause.field === field)) {
					throw new BetterAuthError(
						`Adapter "${adapterId}" must implement native atomic methods for OR predicates on structured values.`,
					);
				}
				continue;
			}
			guard.push({
				field,
				value: value.data,
				operator: "eq",
				connector: "AND",
				mode: "sensitive",
			});
		}
		return guard;
	}

	function changedOne(count: number): boolean {
		if (count !== 0 && count !== 1) {
			throw new BetterAuthError(
				`Adapter "${adapterId}" must return an affected row count of 0 or 1 from an atomic fallback.`,
			);
		}
		return count === 1;
	}

	async function consumeOne(
		request: FallbackRequest,
	): Promise<StoredRow | null> {
		const { model, where } = request;
		const row = await readRow(request);
		if (row === null) return null;
		// Guard the selected snapshot with AND predicates, without widening an OR selector.
		const guard = await snapshotGuard(
			row,
			[...Object.keys(row), ...where.map(({ field }) => field)],
			request,
			"consumeOne",
		);
		const count = await adapter.deleteMany({ model, where: guard });
		return changedOne(count) ? row : null;
	}

	async function incrementOne(
		request: FallbackRequest & {
			increment: Record<string, number>;
			set?: Record<string, unknown> | undefined;
		},
	): Promise<StoredRow | null> {
		const { model, where } = request;
		const mutation = mutationSchema.safeParse(request);
		if (!mutation.success) {
			throw new BetterAuthError(
				"incrementOne requires finite increments and a set object for the atomic fallback.",
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
			const row = await readRow(request);
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
			const guard = await snapshotGuard(row, fields, request, "incrementOne");
			// A no-op takes effect at the read. Stores counting changed rows would report zero.
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
				where: guard,
				update,
			});
			if (changedOne(count)) {
				// A second read could observe another writer's result instead of ours.
				return { ...row, ...update };
			}
		}
		throw new BetterAuthError(
			`Adapter "${adapterId}" could not complete an atomic increment due to contention. Retry the operation or implement incrementOne natively.`,
		);
	}

	return { consumeOne, incrementOne };
}
