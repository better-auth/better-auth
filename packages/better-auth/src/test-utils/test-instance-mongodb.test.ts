import { Db, MongoClient } from "mongodb";
import { describe, expect, it, vi } from "vitest";

let isMongodbAvailable = false;
try {
	const probe = new MongoClient("mongodb://127.0.0.1:27017", {
		serverSelectionTimeoutMS: 2000,
	});
	await probe.connect();
	await probe.close();
	isMongodbAvailable = true;
} catch {
	isMongodbAvailable = false;
}

// Each import after `vi.resetModules()` evaluates the helper again, the way
// Vitest evaluates it once for each test file.
const firstFile = await import("./test-instance");
vi.resetModules();
const secondFile = await import("./test-instance");
vi.resetModules();
const thirdFile = await import("./test-instance");

/**
 * Vitest isolates each test file's modules, so the helper's database name is
 * per file. CI starts MongoDB, so the suite runs there even when the probe
 * fails.
 * @see https://vitest.dev/config/#isolate
 */
describe.runIf(isMongodbAvailable || Boolean(process.env.CI))(
	"getTestInstance with MongoDB",
	() => {
		it("should give each test file its own database", async () => {
			const first = await firstFile.getTestInstance(undefined, {
				testWith: "mongodb",
			});
			const second = await secondFile.getTestInstance(undefined, {
				testWith: "mongodb",
			});

			const { user: firstUser } = await first.signInWithTestUser();
			const { user: secondUser } = await second.signInWithTestUser();

			expect(secondUser.email).toBe(firstUser.email);
			expect(secondUser.id).not.toBe(firstUser.id);
		});

		it("should close the client when dropping the database fails", async () => {
			await thirdFile.getTestInstance(undefined, { testWith: "mongodb" });
			let undroppedDatabase: string | undefined;
			const drop = vi
				.spyOn(Db.prototype, "dropDatabase")
				.mockImplementationOnce(async function (this: Db) {
					undroppedDatabase = this.databaseName;
					throw new Error("drop failed");
				});
			const close = vi.spyOn(MongoClient.prototype, "close");
			try {
				await expect(thirdFile.cleanupTestInstances()).rejects.toThrow(
					"drop failed",
				);
				expect(close).toHaveBeenCalledTimes(1);
			} finally {
				drop.mockRestore();
				close.mockRestore();
				if (undroppedDatabase) {
					const client = await MongoClient.connect("mongodb://127.0.0.1:27017");
					try {
						await client.db(undroppedDatabase).dropDatabase();
					} finally {
						await client.close();
					}
				}
			}
		});
	},
);
