import type { BetterAuthOptions } from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";
import type { MemoryDB } from "./memory-adapter";
import { memoryAdapter } from "./memory-adapter";

/**
 * A self-contained plugin model with loosely-typed optional fields. Using a
 * custom table keeps these adapter-fidelity tests independent of the auth
 * user/session schema and its required-field validation.
 */
const widgetPlugin = {
	id: "widget-test",
	schema: {
		widget: {
			fields: {
				name: { type: "string" as const, required: false },
				tag: { type: "string" as const, required: false },
				count: { type: "number" as const, required: false },
				remaining: { type: "number" as const, required: false },
			},
		},
	},
};

const options: BetterAuthOptions = {
	plugins: [widgetPlugin as any],
};

function setup(): { db: MemoryDB; adapter: DBAdapter<BetterAuthOptions> } {
	const db: MemoryDB = { widget: [] };
	const adapter = memoryAdapter(db)(options);
	return { db, adapter };
}

async function seedWidget(
	adapter: DBAdapter<BetterAuthOptions>,
	id: string,
	name: string,
) {
	return adapter.create({
		model: "widget",
		data: { id, name },
		forceAllowId: true,
	});
}

describe("memory adapter singular mutation with empty predicate", () => {
	it("singular update with an empty where is a no-op and leaves every row untouched", async () => {
		const { adapter } = setup();
		await seedWidget(adapter, "1", "alice");
		await seedWidget(adapter, "2", "bob");

		const result = await adapter.update({
			model: "widget",
			where: [],
			update: { name: "overwritten" },
		});

		expect(result).toBeNull();
		const rows = await adapter.findMany<{ id: string; name: string }>({
			model: "widget",
		});
		expect(rows.map((r) => r.name).sort()).toEqual(["alice", "bob"]);
	});

	it("singular delete with an empty where is a no-op and removes no rows", async () => {
		const { adapter } = setup();
		await seedWidget(adapter, "1", "alice");
		await seedWidget(adapter, "2", "bob");

		await adapter.delete({ model: "widget", where: [] });

		const rows = await adapter.findMany<{ id: string }>({ model: "widget" });
		expect(rows).toHaveLength(2);
	});
});

describe("memory adapter updateMany return shape", () => {
	it("returns the number of affected rows, not a record", async () => {
		const { adapter } = setup();
		await seedWidget(adapter, "1", "alice");
		await seedWidget(adapter, "2", "bob");
		await seedWidget(adapter, "3", "carol");

		const affected = await adapter.updateMany({
			model: "widget",
			where: [{ field: "tag", value: "x" }],
			update: { tag: "x" },
		});
		expect(affected).toBe(0);

		const matched = await adapter.updateMany({
			model: "widget",
			where: [
				{ field: "id", value: "1", connector: "OR" },
				{ field: "id", value: "2", connector: "OR" },
			],
			update: { tag: "grouped" },
		});
		expect(matched).toBe(2);

		const all = await adapter.updateMany({
			model: "widget",
			where: [],
			update: { tag: "everyone" },
		});
		expect(all).toBe(3);
	});
});

describe("memory adapter incrementOne", () => {
	it("applies a positive delta and returns the updated row", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", count: 5 },
			forceAllowId: true,
		});

		const updated = await adapter.incrementOne<{ id: string; count: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
			increment: { count: 3 },
		});

		expect(updated?.count).toBe(8);
		const row = await adapter.findOne<{ count: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
		});
		expect(row?.count).toBe(8);
	});

	it("applies a negative delta to decrement", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", remaining: 2 },
			forceAllowId: true,
		});

		const updated = await adapter.incrementOne<{ remaining: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
			increment: { remaining: -1 },
		});

		expect(updated?.remaining).toBe(1);
	});

	it("treats a missing counter field as zero before applying the delta", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice" },
			forceAllowId: true,
		});

		const updated = await adapter.incrementOne<{ count: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
			increment: { count: 4 },
		});

		expect(updated?.count).toBe(4);
	});

	it("applies absolute set assignments alongside increments", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", count: 1 },
			forceAllowId: true,
		});

		const updated = await adapter.incrementOne<{
			count: number;
			tag: string;
		}>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
			increment: { count: 1 },
			set: { tag: "touched" },
		});

		expect(updated?.count).toBe(2);
		expect(updated?.tag).toBe("touched");
	});

	it("mutates only the single guarded row matching the where clause", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", count: 0 },
			forceAllowId: true,
		});
		await adapter.create({
			model: "widget",
			data: { id: "2", name: "bob", count: 0 },
			forceAllowId: true,
		});

		await adapter.incrementOne({
			model: "widget",
			where: [{ field: "id", value: "1" }],
			increment: { count: 10 },
		});

		const rows = await adapter.findMany<{ id: string; count: number }>({
			model: "widget",
		});
		const byId = Object.fromEntries(rows.map((r) => [r.id, r.count]));
		expect(byId["1"]).toBe(10);
		expect(byId["2"]).toBe(0);
	});

	it("when the guard matches no row, returns null and mutates nothing", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", remaining: 0 },
			forceAllowId: true,
		});

		// The guard `remaining > 0` excludes the row, so no mutation may occur.
		const updated = await adapter.incrementOne<{ remaining: number }>({
			model: "widget",
			where: [
				{ field: "id", value: "1" },
				{ field: "remaining", value: 0, operator: "gt" },
			],
			increment: { remaining: -1 },
		});

		expect(updated).toBeNull();
		const row = await adapter.findOne<{ remaining: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
		});
		expect(row?.remaining).toBe(0);
	});

	it("participates in copy-on-write so a failed transaction discards the increment", async () => {
		const { adapter } = setup();
		await adapter.create({
			model: "widget",
			data: { id: "1", name: "alice", count: 5 },
			forceAllowId: true,
		});

		const failed = await adapter
			.transaction(async (trx) => {
				await trx.incrementOne({
					model: "widget",
					where: [{ field: "id", value: "1" }],
					increment: { count: 100 },
				});
				throw new Error("Simulated failure");
			})
			.catch((error) => error);

		expect(failed).toBeInstanceOf(Error);
		const row = await adapter.findOne<{ count: number }>({
			model: "widget",
			where: [{ field: "id", value: "1" }],
		});
		expect(row?.count).toBe(5);
	});
});

describe("memory adapter transaction isolation", () => {
	it("a failing transaction must not erase a write made by a concurrent in-flight operation", async () => {
		const { adapter } = setup();

		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});

		const failingTransaction = adapter
			.transaction(async (tx) => {
				await tx.create({
					model: "widget",
					data: { id: "tx", name: "in-transaction" },
					forceAllowId: true,
				});
				// Yield so the concurrent write below lands on the live db before
				// this transaction rolls back.
				await gate;
				throw new Error("Simulated failure");
			})
			.catch((error) => error);

		// Concurrent write against the live db while the transaction is in flight.
		await seedWidget(adapter, "outside", "outside-write");
		releaseGate();

		const error = await failingTransaction;
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe("Simulated failure");

		const rows = await adapter.findMany<{ id: string; name: string }>({
			model: "widget",
		});
		// The rollback discarded the transaction's own write but preserved the
		// concurrent outside write.
		expect(rows.map((r) => r.id).sort()).toEqual(["outside"]);
	});

	it("a committing transaction must not erase a write made by a concurrent in-flight operation", async () => {
		const { adapter } = setup();

		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});

		const committingTransaction = adapter.transaction(async (tx) => {
			await tx.create({
				model: "widget",
				data: { id: "tx", name: "in-transaction" },
				forceAllowId: true,
			});
			// Yield so the concurrent write below lands on the live db before
			// this transaction commits.
			await gate;
			return "committed";
		});

		// Concurrent write against the live db while the transaction is in flight.
		await seedWidget(adapter, "outside", "outside-write");
		releaseGate();

		const result = await committingTransaction;
		expect(result).toBe("committed");

		const rows = await adapter.findMany<{ id: string; name: string }>({
			model: "widget",
		});
		// The commit applied the transaction's own write and preserved the
		// concurrent outside write made while it was in flight.
		expect(rows.map((r) => r.id).sort()).toEqual(["outside", "tx"]);
	});

	it("a committing transaction's update to one row does not clobber a concurrent update to a different row", async () => {
		const { adapter } = setup();
		await seedWidget(adapter, "a", "a-original");
		await seedWidget(adapter, "b", "b-original");

		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});

		const tx = adapter.transaction(async (trx) => {
			await trx.update({
				model: "widget",
				where: [{ field: "id", value: "a" }],
				update: { name: "a-from-tx" },
			});
			await gate;
			return "done";
		});

		// Concurrent update of a different row while the transaction is in flight.
		await adapter.update({
			model: "widget",
			where: [{ field: "id", value: "b" }],
			update: { name: "b-from-outside" },
		});
		releaseGate();
		await tx;

		const rows = await adapter.findMany<{ id: string; name: string }>({
			model: "widget",
		});
		const byId = Object.fromEntries(rows.map((r) => [r.id, r.name]));
		expect(byId.a).toBe("a-from-tx");
		expect(byId.b).toBe("b-from-outside");
	});

	it("a committing transaction's delete is applied while a concurrent insert survives", async () => {
		const { adapter } = setup();
		await seedWidget(adapter, "doomed", "to-be-deleted");

		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});

		const tx = adapter.transaction(async (trx) => {
			await trx.delete({
				model: "widget",
				where: [{ field: "id", value: "doomed" }],
			});
			await gate;
			return "done";
		});

		await seedWidget(adapter, "fresh", "concurrent-insert");
		releaseGate();
		await tx;

		const rows = await adapter.findMany<{ id: string }>({ model: "widget" });
		expect(rows.map((r) => r.id).sort()).toEqual(["fresh"]);
	});

	it("uncommitted transaction writes are invisible to operations outside the transaction", async () => {
		const { adapter } = setup();

		let releaseGate: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
		let signalWriteDone: () => void = () => {};
		const writeDone = new Promise<void>((resolve) => {
			signalWriteDone = resolve;
		});

		const tx = adapter.transaction(async (trx) => {
			await trx.create({
				model: "widget",
				data: { id: "tx", name: "in-transaction" },
				forceAllowId: true,
			});
			// The transaction's write has landed in its scope; hold here so the
			// outside read below runs while the write is uncommitted.
			signalWriteDone();
			await gate;
			return "committed";
		});

		await writeDone;
		const observedDuringTransaction = (
			await adapter.findMany<{ id: string }>({ model: "widget" })
		).length;
		releaseGate();
		const result = await tx;

		expect(observedDuringTransaction).toBe(0);
		expect(result).toBe("committed");
		// After commit, the row is visible on the live db.
		const rows = await adapter.findMany<{ id: string }>({ model: "widget" });
		expect(rows.map((r) => r.id)).toEqual(["tx"]);
	});

	it("a committed transaction mutates the original db object in place", async () => {
		const { db, adapter } = setup();

		await adapter.transaction(async (trx) => {
			await trx.create({
				model: "widget",
				data: { id: "committed", name: "kept" },
				forceAllowId: true,
			});
		});

		// The reference the caller passed to memoryAdapter reflects the commit.
		expect(db.widget?.map((r) => r.id)).toEqual(["committed"]);
	});
});
