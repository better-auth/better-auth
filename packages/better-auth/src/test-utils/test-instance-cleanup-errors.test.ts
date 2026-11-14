import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupTestInstances, getTestInstance } from "./test-instance";

async function createSqliteInstance() {
	const { auth } = await getTestInstance();
	const { database } = auth.options;
	expect.assert.instanceOf(database, DatabaseSync);
	return database;
}

describe("cleanupTestInstances", () => {
	const opened: DatabaseSync[] = [];

	afterEach(() => {
		vi.restoreAllMocks();
		for (const database of opened.splice(0)) {
			if (database.isOpen) {
				database.close();
			}
		}
	});

	it("should run the remaining cleanups when one throws", async () => {
		const first = await createSqliteInstance();
		const second = await createSqliteInstance();
		opened.push(first, second);
		const close = vi
			.spyOn(DatabaseSync.prototype, "close")
			.mockImplementationOnce(() => {
				throw new Error("close failed");
			});

		await expect(cleanupTestInstances()).rejects.toThrow("close failed");
		expect(close).toHaveBeenCalledTimes(2);
		expect(first.isOpen).toBe(true);
		expect(second.isOpen).toBe(false);

		await cleanupTestInstances();
		expect(close).toHaveBeenCalledTimes(2);
	});

	it("should report every error when several cleanups throw", async () => {
		opened.push(await createSqliteInstance(), await createSqliteInstance());
		vi.spyOn(DatabaseSync.prototype, "close")
			.mockImplementationOnce(() => {
				throw new Error("first close failed");
			})
			.mockImplementationOnce(() => {
				throw new Error("second close failed");
			});

		const error = await cleanupTestInstances().catch((e: unknown) => e);
		expect.assert.instanceOf(error, AggregateError);
		expect(error.errors.map((e: Error) => e.message)).toEqual([
			"first close failed",
			"second close failed",
		]);
	});
});
