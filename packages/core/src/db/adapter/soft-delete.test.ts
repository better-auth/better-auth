import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { BetterAuthOptions, BetterAuthPlugin } from "../../types";
import { getAuthTables } from "../get-tables";
import type { InferDBFieldsFromPlugins } from "../type";
import { createAdapterFactory } from "./factory";
import type { CleanedWhere, CustomAdapter } from "./index";

type MemoryDB = Record<string, Record<string, any>[]>;

const softDeletePlugin = {
	id: "soft-delete-test",
	schema: {
		todo: {
			fields: {
				title: { type: "string", required: true },
			},
			softDelete: true,
		},
		note: {
			fields: {
				title: { type: "string", required: true },
			},
		},
		user: {
			fields: {},
			softDelete: true,
		},
	},
} satisfies BetterAuthPlugin;

function createMemoryCustomAdapter(
	db: MemoryDB,
	overrides: Partial<CustomAdapter> = {},
): CustomAdapter {
	const table = (model: string) => (db[model] ??= []);
	const matches = (
		record: Record<string, any>,
		where: CleanedWhere[] | undefined,
	) =>
		!where?.length ||
		where.every((w) => {
			const value = record[w.field];
			switch (w.operator) {
				case "eq":
					// Mirror SQL `IS NULL` semantics: a column that was never set
					// (stored as `undefined` in-memory) matches `eq null`.
					return w.value === null ? value == null : value === w.value;
				case "ne":
					// Mirror SQL `IS NOT NULL` semantics for `ne null`.
					return w.value === null ? value != null : value !== w.value;
				default:
					throw new Error(
						`Unsupported operator in test adapter: ${w.operator}`,
					);
			}
		});
	const filter = (model: string, where: CleanedWhere[] | undefined) =>
		table(model).filter((record) => matches(record, where));
	return {
		create: async ({ model, data }) => {
			table(model).push(data);
			return data;
		},
		findOne: async ({ model, where }) =>
			(filter(model, where)[0] as any) ?? null,
		findMany: async ({ model, where, limit, offset }) => {
			let rows = filter(model, where);
			if (offset !== undefined) rows = rows.slice(offset);
			if (limit !== undefined) rows = rows.slice(0, limit);
			return rows as any[];
		},
		count: async ({ model, where }) => filter(model, where).length,
		update: async ({ model, where, update }) => {
			const target = filter(model, where)[0];
			if (!target) return null;
			Object.assign(target, update);
			return target as any;
		},
		updateMany: async ({ model, where, update }) => {
			const rows = filter(model, where);
			for (const row of rows) {
				Object.assign(row, update as Record<string, any>);
			}
			return rows.length;
		},
		delete: async ({ model, where }) => {
			const rows = filter(model, where);
			db[model] = table(model).filter((record) => !rows.includes(record));
		},
		deleteMany: async ({ model, where }) => {
			const rows = filter(model, where);
			db[model] = table(model).filter((record) => !rows.includes(record));
			return rows.length;
		},
		...overrides,
	};
}

function createTestAdapter({
	db,
	overrides,
	options = {},
}: {
	db: MemoryDB;
	overrides?: Partial<CustomAdapter>;
	options?: BetterAuthOptions;
}) {
	return createAdapterFactory<BetterAuthOptions>({
		config: {
			adapterId: "soft-delete-test-adapter",
			adapterName: "Soft Delete Test Adapter",
			usePlural: false,
		},
		adapter: () => createMemoryCustomAdapter(db, overrides),
	})({
		plugins: [softDeletePlugin],
		...options,
	});
}

type Todo = {
	id: string;
	title: string;
	deletedAt?: Date | null;
};

describe("soft delete schema", () => {
	it("adds a deletedAt field to soft-deletable models", () => {
		const tables = getAuthTables({ plugins: [softDeletePlugin] });
		expect(tables.todo?.softDelete).toBe(true);
		expect(tables.todo?.fields.deletedAt).toEqual({
			type: "date",
			required: false,
			input: false,
			fieldName: "deletedAt",
		});
	});

	it("allows plugins to mark core models as soft-deletable", () => {
		const tables = getAuthTables({ plugins: [softDeletePlugin] });
		expect(tables.user?.softDelete).toBe(true);
		expect(tables.user?.fields.deletedAt).toBeDefined();
	});

	it("does not add deletedAt to models without soft delete", () => {
		const tables = getAuthTables({ plugins: [softDeletePlugin] });
		expect(tables.note?.softDelete).toBeUndefined();
		expect(tables.note?.fields.deletedAt).toBeUndefined();
		expect(tables.session?.fields.deletedAt).toBeUndefined();
	});

	it("does not override a custom deletedAt field definition", () => {
		const customPlugin = {
			id: "custom-deleted-at",
			schema: {
				todo: {
					fields: {
						title: { type: "string", required: true },
						deletedAt: {
							type: "date",
							required: false,
							input: false,
							fieldName: "removed_at",
						},
					},
					softDelete: true,
				},
			},
		} satisfies BetterAuthPlugin;
		const tables = getAuthTables({ plugins: [customPlugin] });
		expect(tables.todo?.fields.deletedAt?.fieldName).toBe("removed_at");
	});

	it("infers deletedAt on models marked soft-deletable by a plugin", () => {
		type TodoFields = InferDBFieldsFromPlugins<
			"todo",
			[typeof softDeletePlugin]
		>;
		expectTypeOf<TodoFields["deletedAt"]>().toEqualTypeOf<
			Date | null | undefined
		>();
	});
});

describe("soft delete adapter behavior", () => {
	it("delete soft-deletes the row instead of removing it", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const todo = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "buy milk" },
		});

		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});

		expect(db.todo).toHaveLength(1);
		expect(db.todo![0]!.deletedAt).toBeInstanceOf(Date);

		const found = await adapter.findOne<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});
		expect(found).toBeNull();

		const foundWithDeleted = await adapter.findOne<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
			withDeleted: true,
		});
		expect(foundWithDeleted?.id).toBe(todo.id);
		expect(foundWithDeleted?.deletedAt).toBeInstanceOf(Date);
	});

	it("deleteMany soft-deletes rows, returns the count and skips already deleted rows", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const first = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.create({ model: "todo", data: { title: "b" } });
		await adapter.create({ model: "todo", data: { title: "c" } });

		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
		});

		const deleted = await adapter.deleteMany({
			model: "todo",
			where: [],
		});
		expect(deleted).toBe(2);
		expect(db.todo).toHaveLength(3);
		expect(db.todo!.every((row) => row.deletedAt instanceof Date)).toBe(true);

		const deletedAgain = await adapter.deleteMany({
			model: "todo",
			where: [],
		});
		expect(deletedAgain).toBe(0);
	});

	it("findMany and count exclude soft-deleted rows unless withDeleted is set", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const first = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.create({ model: "todo", data: { title: "b" } });

		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
		});

		const rows = await adapter.findMany<Todo>({ model: "todo" });
		expect(rows).toHaveLength(1);
		expect(rows[0]!.title).toBe("b");

		const allRows = await adapter.findMany<Todo>({
			model: "todo",
			withDeleted: true,
		});
		expect(allRows).toHaveLength(2);

		expect(await adapter.count({ model: "todo" })).toBe(1);
		expect(await adapter.count({ model: "todo", withDeleted: true })).toBe(2);
	});

	it("update skips soft-deleted rows and supports restoring with withDeleted", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const todo = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});

		const updated = await adapter.update<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
			update: { title: "changed" },
		});
		expect(updated).toBeNull();
		expect(db.todo![0]!.title).toBe("a");

		const restored = await adapter.update<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
			update: { deletedAt: null },
			withDeleted: true,
		});
		expect(restored?.deletedAt).toBeNull();

		const found = await adapter.findOne<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});
		expect(found?.id).toBe(todo.id);
	});

	it("updateMany skips soft-deleted rows unless withDeleted is set", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const first = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.create({ model: "todo", data: { title: "b" } });
		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
		});

		const updated = await adapter.updateMany({
			model: "todo",
			where: [],
			update: { title: "changed" },
		});
		expect(updated).toBe(1);

		const updatedAll = await adapter.updateMany({
			model: "todo",
			where: [],
			update: { title: "changed" },
			withDeleted: true,
		});
		expect(updatedAll).toBe(2);
	});

	it("hardDelete permanently removes rows from soft-deletable models", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const first = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.create({ model: "todo", data: { title: "b" } });

		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
		});
		// A hard delete also reaches rows that were already soft-deleted.
		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
			hardDelete: true,
		});
		expect(db.todo).toHaveLength(1);

		const purged = await adapter.deleteMany({
			model: "todo",
			where: [],
			hardDelete: true,
		});
		expect(purged).toBe(1);
		expect(db.todo).toHaveLength(0);
	});

	it("respects an explicit deletedAt filter in the where clause", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const first = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});
		await adapter.create({ model: "todo", data: { title: "b" } });
		await adapter.delete({
			model: "todo",
			where: [{ field: "id", value: first.id }],
		});

		// Querying only the soft-deleted rows must not be overridden by the
		// automatic `deletedAt = null` filter.
		const deletedRows = await adapter.findMany<Todo>({
			model: "todo",
			where: [{ field: "deletedAt", operator: "ne", value: null }],
		});
		expect(deletedRows).toHaveLength(1);
		expect(deletedRows[0]!.id).toBe(first.id);
	});

	it("consumeOne soft-deletes for soft-deletable models and skips the native implementation", async () => {
		const db: MemoryDB = {};
		const nativeConsumeOne = vi.fn();
		const adapter = createTestAdapter({
			db,
			overrides: {
				consumeOne: nativeConsumeOne,
			},
		});
		const todo = await adapter.create<{ title: string }, Todo>({
			model: "todo",
			data: { title: "a" },
		});

		const consumed = await adapter.consumeOne<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});
		expect(consumed?.id).toBe(todo.id);
		expect(nativeConsumeOne).not.toHaveBeenCalled();
		expect(db.todo).toHaveLength(1);
		expect(db.todo![0]!.deletedAt).toBeInstanceOf(Date);

		const consumedAgain = await adapter.consumeOne<Todo>({
			model: "todo",
			where: [{ field: "id", value: todo.id }],
		});
		expect(consumedAgain).toBeNull();
	});

	it("consumeOne still uses the native implementation for non-soft-delete models", async () => {
		const db: MemoryDB = {};
		const nativeConsumeOne = vi
			.fn()
			.mockResolvedValue({ id: "note-id", title: "a" });
		const adapter = createTestAdapter({
			db,
			overrides: {
				consumeOne: nativeConsumeOne,
			},
		});

		const consumed = await adapter.consumeOne<{ id: string; title: string }>({
			model: "note",
			where: [{ field: "id", value: "note-id" }],
		});
		expect(consumed?.id).toBe("note-id");
		expect(nativeConsumeOne).toHaveBeenCalledTimes(1);
	});

	it("keeps hard delete behavior for models without soft delete", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const note = await adapter.create<
			{ title: string },
			{ id: string; title: string }
		>({
			model: "note",
			data: { title: "a" },
		});

		await adapter.delete({
			model: "note",
			where: [{ field: "id", value: note.id }],
		});
		expect(db.note).toHaveLength(0);
	});

	it("soft-deletes core models marked soft-deletable by a plugin", async () => {
		const db: MemoryDB = {};
		const adapter = createTestAdapter({ db });
		const user = await adapter.create<
			{ name: string; email: string },
			{ id: string; email: string }
		>({
			model: "user",
			data: { name: "Alice", email: "alice@example.com" },
		});

		await adapter.delete({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		expect(db.user).toHaveLength(1);
		expect(db.user![0]!.deletedAt).toBeInstanceOf(Date);

		const found = await adapter.findOne({
			model: "user",
			where: [{ field: "email", value: "alice@example.com" }],
		});
		expect(found).toBeNull();
	});
});
