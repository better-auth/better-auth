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
