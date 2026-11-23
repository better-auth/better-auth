import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { BetterAuthOptions } from "../../types";
import { createAdapterFactory } from "./factory";
import type { CleanedWhere, CustomAdapter, Where } from "./index";

function createCustomAdapter(
	overrides: Partial<CustomAdapter> = {},
): CustomAdapter {
	return {
		create: async ({ data }) => data,
		update: async () => null,
		updateMany: async () => 0,
		findOne: async () => null,
		findMany: async () => [],
		delete: async () => {},
		deleteMany: async () => 0,
		consumeOne: async () => null,
		incrementOne: async () => null,
		count: async () => 0,
		...overrides,
	};
}

function createTestAdapter({
	adapter,
	options = {},
}: {
	adapter: CustomAdapter;
	options?: BetterAuthOptions;
}) {
	return createAdapterFactory<BetterAuthOptions>({
		config: {
			adapterId: "test-adapter",
			adapterName: "Test Adapter",
			usePlural: true,
			customTransformInput({ action, data, field }) {
				if (field === "identifier_text" && typeof data === "string") {
					return `${data}:${action}`;
				}
				return data;
			},
			customTransformOutput({ data, field }) {
				if (field === "identifier" && typeof data === "string") {
					return `${data}:output`;
				}
				return data;
			},
		},
		adapter: () => adapter,
	})({
		...options,
		verification: {
			modelName: "verificationRecord",
			fields: {
				identifier: "identifier_text",
			},
			additionalFields: {
				attempts: {
					type: "number",
					required: false,
					fieldName: "attempt_count",
				},
			},
			...options.verification,
		},
	});
}

describe("createAdapterFactory model identity", () => {
	it("keeps the schema model when its custom name matches another schema key", async () => {
		const findOne = vi.fn(async () => null);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: { adapterId: "test-adapter" },
			adapter: () => createCustomAdapter({ findOne }),
		})({
			user: { modelName: "account" },
			account: { modelName: "identity" },
			advanced: { database: { joins: true } },
		});

		await adapter.findOne({
			model: "session",
			where: [{ field: "id", value: "session-id" }],
			join: { user: true },
		});

		expect(findOne).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "session",
				modelKey: "session",
				join: {
					account: expect.objectContaining({ modelKey: "user" }),
				},
			}),
		);
	});
});

describe("createAdapterFactory fallback join", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/12064
	 */
	it("reports a failed join query only through the configured logger", async ({
		onTestFinished,
	}) => {
		const driverError = new Error('select from "user" where id = user-id');
		const log = vi.fn();
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		onTestFinished(() => consoleError.mockRestore());
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: { adapterId: "test-adapter" },
			adapter: () =>
				createCustomAdapter({
					findOne: async <T>({
						model,
					}: Parameters<CustomAdapter["findOne"]>[0]) => {
						if (model === "user") throw driverError;
						return { id: "session-id", userId: "user-id" } as T;
					},
				}),
		})({
			logger: { log },
		});

		await expect(
			adapter.findOne({
				model: "session",
				where: [{ field: "id", value: "session-id" }],
				join: { user: true },
			}),
		).rejects.toBe(driverError);
		expect(log).toHaveBeenCalledWith(
			"error",
			expect.any(String),
			expect.anything(),
		);
		expect(consoleError).not.toHaveBeenCalled();
	});
});

describe("createAdapterFactory atomic primitives", () => {
	it("delegates consumeOne to the native adapter with transformed where and output", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				consumeOne: async <T>({
					model,
					where,
				}: {
					model: string;
					where: Required<Where>[];
				}) => {
					expect(model).toBe("verificationRecords");
					expect(where).toEqual([
						{
							field: "identifier_text",
							value: "token:consumeOne",
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					]);
					return {
						id: "verification-id",
						identifier_text: "stored-token",
					} as T;
				},
			}),
		});

		const result = await adapter.consumeOne<{ id: string; identifier: string }>(
			{
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
			},
		);

		expect(result).toEqual({
			id: "verification-id",
			identifier: "stored-token:output",
		});
	});

	it("delegates incrementOne to the native adapter with mapped increment fields", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: async <T>({
					model,
					where,
					increment,
					set,
				}: {
					model: string;
					where: Required<Where>[];
					increment: Record<string, number>;
					set?: Record<string, unknown> | undefined;
				}) => {
					expect(model).toBe("verificationRecords");
					expect(where).toEqual([
						{
							field: "identifier_text",
							value: "token:incrementOne",
							operator: "eq",
							connector: "AND",
							mode: "sensitive",
						},
					]);
					expect(increment).toEqual({ attempt_count: 1 });
					expect(set).toEqual({
						value: "next",
						updatedAt: expect.any(Date),
					});
					return {
						id: "verification-id",
						identifier_text: "stored-token",
						attempt_count: 2,
						value: "next",
					} as T;
				},
			}),
		});

		const result = await adapter.incrementOne<{
			id: string;
			identifier: string;
			attempts: number;
			value: string;
		}>({
			model: "verification",
			where: [{ field: "identifier", value: "token" }],
			increment: { attempts: 1 },
			set: { value: "next" },
		});

		expect(result).toEqual({
			id: "verification-id",
			identifier: "stored-token:output",
			attempts: 2,
			value: "next",
		});
	});

	it("throws before native incrementOne when every update field is transformed away", async () => {
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				adapterName: "Test Adapter",
				usePlural: true,
				customTransformInput({ action, data }) {
					if (action === "update") {
						return undefined;
					}
					return data;
				},
			},
			adapter: () =>
				createCustomAdapter({
					incrementOne: async () => {
						throw new Error("incrementOne should not be called");
					},
				}),
		})({
			verification: {
				modelName: "verificationRecord",
				additionalFields: {
					attempts: {
						type: "number",
						required: false,
						fieldName: "attempt_count",
					},
				},
			},
		});

		await expect(
			adapter.incrementOne({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				increment: {},
				set: { attempts: 1 },
			}),
		).rejects.toThrow(/resolved to an empty update/);
	});

	it("throws a clear error when updateMany does not return a finite count", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				updateMany: async () => Number.NaN,
			}),
		});

		await expect(
			adapter.updateMany({
				model: "verification",
				where: [{ field: "identifier", value: "token" }],
				update: { value: "next" },
			}),
		).rejects.toThrow(/updateMany must return a finite number/);
	});
});

/**
 * HTTP query params arrive as strings. Coercion must happen in the adapter
 * factory before the underlying store sees the where clause — SQL engines
 * often cast silently, which can hide missing coercion in integration tests.
 */
describe("createAdapterFactory where value coercion", () => {
	it("coerces string where values to match field types before querying", async () => {
		const seenWhere: CleanedWhere[][] = [];
		const adapter = createAdapterFactory({
			config: {
				adapterId: "test-adapter",
				adapterName: "Test Adapter",
				supportsBooleans: true,
			},
			adapter: () =>
				createCustomAdapter({
					findMany: async <T>(
						params: Parameters<CustomAdapter["findMany"]>[0],
					) => {
						if (params.where) {
							seenWhere.push(params.where);
						}
						return [] as T[];
					},
				}),
		})({
			user: {
				additionalFields: {
					age: { type: "number", required: false },
				},
			},
		});

		await adapter.findMany({
			model: "user",
			where: [{ field: "emailVerified", operator: "eq", value: "false" }],
		});
		await adapter.findMany({
			model: "user",
			where: [{ field: "age", operator: "eq", value: "25" }],
		});
		await adapter.findMany({
			model: "user",
			where: [{ field: "age", operator: "in", value: ["25", "30"] }],
		});

		expect(seenWhere).toEqual([
			[
				{
					field: "emailVerified",
					value: false,
					operator: "eq",
					connector: "AND",
					mode: "sensitive",
				},
			],
			[
				{
					field: "age",
					value: 25,
					operator: "eq",
					connector: "AND",
					mode: "sensitive",
				},
			],
			[
				{
					field: "age",
					value: [25, 30],
					operator: "in",
					connector: "AND",
					mode: "sensitive",
				},
			],
		]);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/12389#discussion_r4531585767
 */
describe("createAdapterFactory serial id where values", () => {
	it("keeps null for id and reference fields instead of coercing it to 0", async () => {
		const seenWhere: CleanedWhere[][] = [];
		const adapter = createAdapterFactory({
			config: { adapterId: "test-adapter", adapterName: "Test Adapter" },
			adapter: () =>
				createCustomAdapter({
					findMany: async <T>(
						params: Parameters<CustomAdapter["findMany"]>[0],
					) => {
						if (params.where) seenWhere.push(params.where);
						return [] as T[];
					},
				}),
		})({ advanced: { database: { generateId: "serial" } } });

		await adapter.findMany({
			model: "session",
			where: [{ field: "userId", operator: "ne", value: null }],
		});
		await adapter.findMany({
			model: "session",
			where: [{ field: "userId", value: "2" }],
		});
		await adapter.findMany({
			model: "session",
			where: [{ field: "id", operator: "ne", value: null }],
		});
		await adapter.findMany({
			model: "session",
			where: [{ field: "id", value: "3" }],
		});

		expect(seenWhere.map(([w]) => w!.value)).toEqual([null, 2, null, 3]);
	});
});

/**
 * @see https://cwe.mitre.org/data/definitions/367.html
 */
describe("legacy adapter atomic fallbacks", () => {
	function setup(
		onTestFinished: (fn: () => void) => void,
		disableTransformInput = false,
	) {
		const db = new DatabaseSync(":memory:");
		onTestFinished(() => db.close());
		db.exec(
			"CREATE TABLE verification (_id TEXT PRIMARY KEY, identifier TEXT, value TEXT, counter REAL, updatedAt TEXT)",
		);
		db.exec(
			"INSERT INTO verification VALUES ('a', 'token', 'secret', NULL, NULL)",
		);
		const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
		function condition(where: CleanedWhere[]) {
			return (
				where
					.map(({ field, value, operator, connector }, index) => {
						if (operator !== "eq" && operator !== "gt")
							throw new Error("Unsupported test predicate");
						return `${index ? connector + " " : ""}${quote(field)} ${value === null ? "IS NULL" : operator === "gt" ? "> ?" : "= ?"}`;
					})
					.join(" ") || "1=1"
			);
		}
		function values(where: CleanedWhere[]) {
			return where
				.filter(({ value }) => value !== null)
				.map(({ value }) => {
					if (typeof value !== "string" && typeof value !== "number")
						throw new Error("Unsupported test value");
					return value;
				});
		}
		const raw = {
			...createCustomAdapter(),
			consumeOne: undefined,
			incrementOne: undefined,
			findOne: async <T>({ where }: { where: CleanedWhere[] }) =>
				(db
					.prepare(
						`SELECT * FROM verification WHERE ${condition(where)} LIMIT 1`,
					)
					.get(...values(where)) ?? null) as T | null,
			deleteMany: async ({ where }: { where: CleanedWhere[] }) =>
				Number(
					db
						.prepare(`DELETE FROM verification WHERE ${condition(where)}`)
						.run(...values(where)).changes,
				),
			updateMany: async ({
				where,
				update,
			}: {
				where: CleanedWhere[];
				update: Record<string, unknown>;
			}) => {
				const entries = Object.entries(update);
				const params = entries.map(([, value]) => {
					if (
						value === null ||
						typeof value === "string" ||
						typeof value === "number"
					)
						return value;
					throw new Error("Unsupported test update");
				});
				return Number(
					db
						.prepare(
							`UPDATE verification SET ${entries.map(([field]) => `${quote(field)} = ?`).join(", ")} WHERE ${condition(where)}`,
						)
						.run(...params, ...values(where)).changes,
				);
			},
		};
		const factory = createAdapterFactory({
			config: {
				adapterId: "legacy",
				disableTransformInput,
				mapKeysTransformInput: { id: "_id" },
				mapKeysTransformOutput: { _id: "id" },
			},
			adapter: () => raw,
		});
		const options = {
			verification: {
				additionalFields: {
					attempts: {
						type: "number" as const,
						required: false,
						fieldName: "counter",
					},
				},
			},
		};
		return { db, raw, first: factory(options), second: factory(options) };
	}
	const request = {
		model: "verification",
		where: [{ field: "identifier", value: "token" }],
	};
	it("lets only one independent adapter consume a credential", async ({
		onTestFinished,
	}) => {
		const { db, first, second } = setup(onTestFinished);
		const results = await Promise.all([
			first.consumeOne(request),
			second.consumeOne(request),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(results.find(Boolean)).toMatchObject({ id: "a", value: "secret" });
		expect(
			db.prepare("SELECT count(*) AS count FROM verification").get(),
		).toMatchObject({ count: 0 });
	});
	it("does not lose concurrent increments starting from null", async ({
		onTestFinished,
	}) => {
		const { db, first, second } = setup(onTestFinished);
		const results = await Promise.all(
			[first, second, first].map((adapter) =>
				adapter.incrementOne<{ attempts: number }>({
					...request,
					increment: { attempts: 1 },
				}),
			),
		);
		expect(results.map((row) => row?.attempts).sort()).toEqual([1, 2, 3]);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: 3,
		});
	});
	it("increments despite unrelated concurrent writes", async ({
		onTestFinished,
	}) => {
		const { db, raw, first } = setup(onTestFinished);
		const update = raw.updateMany;
		raw.updateMany = async (args) => {
			db.exec("UPDATE verification SET value = value || '-changed'");
			return update(args);
		};
		expect(
			await first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).toMatchObject({ attempts: 1 });
		expect(
			db.prepare("SELECT counter, value FROM verification").get(),
		).toMatchObject({ counter: 1, value: "secret-changed" });
	});
	it("treats an undefined legacy read as a missing row", async ({
		onTestFinished,
	}) => {
		const { raw, first } = setup(onTestFinished);
		// Legacy JavaScript adapters commonly return rows[0].
		raw.findOne = async <T>() => undefined as T | null;
		await expect(first.consumeOne(request)).resolves.toBeNull();
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).resolves.toBeNull();
	});
	it("uses stored counters even when output transformation is lossy", async ({
		onTestFinished,
	}) => {
		const { raw, db } = setup(onTestFinished);
		db.exec("UPDATE verification SET counter = 2");
		const adapter = createAdapterFactory({
			config: {
				adapterId: "masked-counter",
				mapKeysTransformInput: { id: "_id" },
				mapKeysTransformOutput: { _id: "id" },
				customTransformOutput: ({ field, data }) =>
					field === "attempts" ? 0 : data,
			},
			adapter: () => raw,
		})({
			verification: {
				additionalFields: {
					attempts: { type: "number", required: false, fieldName: "counter" },
				},
			},
		});
		expect(await adapter.findOne(request)).toMatchObject({ attempts: 0 });
		expect(
			await adapter.incrementOne({ ...request, increment: { attempts: 1 } }),
		).toMatchObject({ attempts: 0 });
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: 3,
		});
	});

	it("returns the row produced by its own update", async ({
		onTestFinished,
	}) => {
		const { db, raw, first } = setup(onTestFinished);
		const update = raw.updateMany;
		raw.updateMany = async (args) => {
			const result = await update(args);
			db.exec("UPDATE verification SET counter = 99");
			return result;
		};
		expect(
			await first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).toMatchObject({ attempts: 1 });
	});
	it("does not return a credential replaced between read and delete", async ({
		onTestFinished,
	}) => {
		const { db, raw, first } = setup(onTestFinished);
		const remove = raw.deleteMany;
		raw.deleteMany = async (args) => {
			db.exec("UPDATE verification SET value = 'replacement'");
			return remove(args);
		};
		expect(await first.consumeOne(request)).toBeNull();
		expect(db.prepare("SELECT value FROM verification").get()).toMatchObject({
			value: "replacement",
		});
	});
	it("keeps OR selectors from widening the guarded deletion", async ({
		onTestFinished,
	}) => {
		const { db, first } = setup(onTestFinished);
		db.exec(
			"INSERT INTO verification VALUES ('b', 'other', 'other-secret', 0, NULL)",
		);
		await first.consumeOne({
			model: "verification",
			where: [
				{ field: "identifier", value: "token" },
				{ field: "identifier", value: "other", connector: "OR" },
			],
		});
		expect(
			db.prepare("SELECT count(*) AS count FROM verification").get(),
		).toMatchObject({ count: 1 });
	});
	it("rejects contention exhaustion instead of reporting a missing row", async ({
		onTestFinished,
	}) => {
		const { raw, first } = setup(onTestFinished);
		raw.updateMany = async () => 0;
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toThrow(/contention/);
	});
	it.for([2, -1, 0.5, Number.NaN])(
		"rejects invalid affected counts (%s)",
		async (count, { onTestFinished }) => {
			const { raw, first } = setup(onTestFinished);
			raw.deleteMany = async () => count;
			raw.updateMany = async () => count;
			await expect(first.consumeOne(request)).rejects.toThrow(/affected/);
			await expect(
				first.incrementOne({ ...request, increment: { attempts: 1 } }),
			).rejects.toThrow(/affected/);
		},
	);
	it("identifies invalid increment input before writing", async ({
		onTestFinished,
	}) => {
		const { first, db } = setup(onTestFinished);
		await expect(
			first.incrementOne({ ...request, increment: { attempts: Number.NaN } }),
		).rejects.toThrow(/^incrementOne requires finite increments/);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: null,
		});
	});
	it("rejects bigint counters without coercion or writes", async ({
		onTestFinished,
	}) => {
		const { raw, first, db } = setup(onTestFinished);
		const read = raw.findOne;
		raw.findOne = async <T>(args: { where: CleanedWhere[] }) =>
			({
				...(await read<Record<string, unknown>>(args)),
				counter: 9007199254740993n,
			}) as T;
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toThrow(/finite numeric counter/);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: null,
		});
	});
	it("rejects invalid counters before writing", async ({ onTestFinished }) => {
		const { db, first } = setup(onTestFinished);
		db.exec("UPDATE verification SET counter = 'invalid'");
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toThrow(/counter/);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: "invalid",
		});
	});
	it("handles an absent nullable counter with the null guard", async ({
		onTestFinished,
	}) => {
		const { raw, first, second, db } = setup(onTestFinished);
		const find = raw.findOne;
		raw.findOne = async <T>(args: { where: CleanedWhere[] }) => {
			const row = await find<Record<string, unknown>>(args);
			if (row?.counter === null) {
				const { counter: _counter, ...withoutCounter } = row;
				return withoutCounter as T;
			}
			return row as T | null;
		};
		await Promise.all(
			[first, second].map((adapter) =>
				adapter.incrementOne({ ...request, increment: { attempts: 1 } }),
			),
		);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: 2,
		});
	});
	it("honors a counter guard after losing a race", async ({
		onTestFinished,
	}) => {
		const { db, first, second } = setup(onTestFinished);
		db.exec("UPDATE verification SET counter = 1");
		const guarded = {
			model: "verification",
			where: [{ field: "attempts", value: 0, operator: "gt" as const }],
			increment: { attempts: -1 },
		};
		const results = await Promise.all([
			first.incrementOne(guarded),
			second.incrementOne(guarded),
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: 0,
		});
	});
	it("completes a no-op without relying on changed-row counts", async ({
		onTestFinished,
	}) => {
		const { db, raw, first } = setup(onTestFinished);
		db.exec("UPDATE verification SET counter = 1");
		raw.updateMany = async () => {
			throw new Error("A no-op should not write");
		};
		expect(
			await first.incrementOne({ ...request, increment: { attempts: 0 } }),
		).toMatchObject({ attempts: 1 });
	});
	it("compares date values when a set-only update is a no-op", async ({
		onTestFinished,
	}) => {
		const { raw, first } = setup(onTestFinished);
		const find = raw.findOne;
		const time = new Date("2026-01-01T00:00:00Z");
		raw.findOne = async <T>(args: { where: CleanedWhere[] }) => {
			const row = await find<Record<string, unknown>>(args);
			return row ? ({ ...row, updatedAt: new Date(time) } as T) : null;
		};
		raw.updateMany = async () => {
			throw new Error("A date no-op should not write");
		};
		expect(
			await first.incrementOne({
				...request,
				increment: {},
				set: { updatedAt: time },
			}),
		).toMatchObject({ updatedAt: time });
	});

	it("fails before writing when the row id is missing", async ({
		onTestFinished,
	}) => {
		const { raw, first, db } = setup(onTestFinished);
		raw.findOne = async <T>() =>
			({ identifier: "token", value: "secret" }) as T;
		await expect(first.consumeOne(request)).rejects.toThrow(/row id/);
		expect(
			db.prepare("SELECT count(*) AS count FROM verification").get(),
		).toMatchObject({ count: 1 });
	});
	it("allows unrelated structured data in returned rows", async ({
		onTestFinished,
	}) => {
		const { raw, first, db } = setup(onTestFinished);
		const find = raw.findOne;
		raw.findOne = async <T>(args: { where: CleanedWhere[] }) => {
			const row = await find<Record<string, unknown>>(args);
			return row
				? ({ ...row, metadata: { locale: "en" }, tags: ["test"] } as T)
				: null;
		};
		expect(await first.consumeOne(request)).toMatchObject({
			id: "a",
			value: "secret",
		});
		expect(
			db.prepare("SELECT count(*) AS count FROM verification").get(),
		).toMatchObject({ count: 0 });
	});

	it("rejects malformed reads instead of treating them as missing", async ({
		onTestFinished,
	}) => {
		const { raw, first, db } = setup(onTestFinished);
		raw.findOne = async <T>() => false as T;
		await expect(first.consumeOne(request)).rejects.toThrow(/snapshot or null/);
		expect(
			db.prepare("SELECT count(*) AS count FROM verification").get(),
		).toMatchObject({ count: 1 });
	});
	it("propagates write failures without reporting a successful increment", async ({
		onTestFinished,
	}) => {
		const { first, raw, db } = setup(onTestFinished);
		const failure = new Error("backend unavailable");
		raw.updateMany = async () => {
			throw failure;
		};
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toBe(failure);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: null,
		});
	});

	it("uses adapter-owned transforms for object IDs", async () => {
		const physicalId = { encoded: "a" };
		const raw = createCustomAdapter({
			consumeOne: undefined,
			incrementOne: undefined,
			findOne: async <T>() =>
				({ _id: physicalId, identifier: "token", value: "secret" }) as T,
			deleteMany: async ({ where }) => {
				expect(where.find((clause) => clause.field === "_id")?.value).toBe(
					physicalId,
				);
				return 1;
			},
		});
		const adapter = createAdapterFactory({
			config: {
				adapterId: "object-id",
				mapKeysTransformInput: { id: "_id" },
				mapKeysTransformOutput: { _id: "id" },
				customTransformInput: ({ field, data }) =>
					field === "_id" ? physicalId : data,
				customTransformOutput: ({ field, data }) =>
					field === "id" ? "a" : data,
			},
			adapter: () => raw,
		})({});
		expect(await adapter.consumeOne(request)).toMatchObject({
			id: "a",
			value: "secret",
		});
	});

	it("rejects increments that cannot change a large counter", async ({
		onTestFinished,
	}) => {
		const { first, db } = setup(onTestFinished);
		db.prepare("UPDATE verification SET counter = ?").run(2 ** 53);
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toThrow(/safely/);
		expect(db.prepare("SELECT counter FROM verification").get()).toMatchObject({
			counter: 2 ** 53,
		});
	});

	it("omits undefined assignments even when input transformation is disabled", async ({
		onTestFinished,
	}) => {
		const { first, raw, db } = setup(onTestFinished, true);
		const write = raw.updateMany;
		raw.updateMany = async (args) => {
			expect(args.update).not.toHaveProperty("value");
			return write(args);
		};
		expect(
			await first.incrementOne({
				...request,
				increment: { attempts: 1 },
				set: { value: undefined },
			}),
		).toMatchObject({ value: "secret", attempts: 1 });
		expect(
			db.prepare("SELECT value, counter FROM verification").get(),
		).toMatchObject({ value: "secret", counter: 1 });
	});
	it("preserves explicit null assignments", async ({ onTestFinished }) => {
		const { first, db } = setup(onTestFinished, true);
		expect(
			await first.incrementOne({
				...request,
				increment: {},
				set: { value: null },
			}),
		).toMatchObject({ value: null });
		expect(db.prepare("SELECT value FROM verification").get()).toMatchObject({
			value: null,
		});
	});
	it("treats undefined-only assignments as a no-op", async ({
		onTestFinished,
	}) => {
		const { first, raw } = setup(onTestFinished, true);
		raw.updateMany = async () => {
			throw new Error("Undefined assignments must not write");
		};
		expect(
			await first.incrementOne({
				...request,
				increment: {},
				set: { value: undefined },
			}),
		).toMatchObject({ value: "secret" });
	});

	it("returns null when the selector does not match", async ({
		onTestFinished,
	}) => {
		const { first } = setup(onTestFinished);
		const missing = {
			...request,
			where: [{ field: "identifier", value: "missing" }],
		};
		expect(await first.consumeOne(missing)).toBeNull();
		expect(
			await first.incrementOne({ ...missing, increment: { attempts: 1 } }),
		).toBeNull();
	});
});

describe("createAdapterFactory incrementMany", () => {
	it("returns an empty array without calling native incrementMany", async () => {
		const incrementMany = vi.fn(async () => {
			throw new Error("incrementMany should not be called");
		});
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({ incrementMany }),
		});
		await expect(
			adapter.incrementMany({
				model: "verification",
				increment: { attempts: 1 },
				rows: [],
			}),
		).resolves.toEqual([]);
		expect(incrementMany).not.toHaveBeenCalled();
	});

	it("throws when increment and set are both empty", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter(),
		});
		await expect(
			adapter.incrementMany({
				model: "verification",
				increment: {},
				rows: [{ where: [{ field: "id", value: "a" }] }],
			}),
		).rejects.toThrow(
			"incrementMany requires a non-empty `increment` or `set`; both were empty.",
		);
	});

	it("delegates to native incrementMany with mapped fields and sorted ids", async () => {
		const incrementMany = vi.fn(
			async <T>({
				model,
				where,
				increment,
				set,
				rows,
			}: {
				model: string;
				where?: unknown;
				increment: Record<string, number>;
				set?: Record<string, unknown> | undefined;
				rows: Array<{ where: Required<Where>[] }>;
			}) => {
				expect(model).toBe("verificationRecords");
				expect(where).toBeUndefined();
				expect(increment).toEqual({ attempt_count: 1 });
				expect(set).toEqual({
					value: "next",
					updatedAt: expect.any(Date),
				});
				expect(rows.map((row) => row.where[0]?.value)).toEqual(["a", "b"]);
				expect(rows[0]?.where).toEqual([
					{
						field: "id",
						value: "a",
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
					{
						field: "identifier_text",
						value: "token:incrementMany",
						operator: "eq",
						connector: "AND",
						mode: "sensitive",
					},
				]);
				return [
					{
						id: "b",
						identifier_text: "stored-token",
						attempt_count: 2,
					},
					{
						id: "a",
						identifier_text: "stored-token",
						attempt_count: 2,
					},
				] as T[];
			},
		);
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementMany: incrementMany as CustomAdapter["incrementMany"],
			}),
		});

		const result = await adapter.incrementMany<{
			id: string;
			identifier: string;
			attempts: number;
		}>({
			model: "verification",
			increment: { attempts: 1 },
			set: { value: "next" },
			rows: [
				{
					where: [
						{ field: "id", value: "b" },
						{ field: "identifier", value: "token" },
					],
				},
				{
					where: [
						{ field: "id", value: "a" },
						{ field: "identifier", value: "token" },
					],
				},
			],
		});

		expect(incrementMany).toHaveBeenCalledTimes(1);
		expect(result.map((row) => row.id)).toEqual(["b", "a"]);
		expect(result[0]?.identifier).toBe("stored-token:output");
	});

	it("throws on duplicate ids", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementMany: async () => {
					throw new Error("incrementMany should not be called");
				},
			}),
		});
		await expect(
			adapter.incrementMany({
				model: "verification",
				increment: { attempts: 1 },
				rows: [
					{ where: [{ field: "id", value: "a" }] },
					{ where: [{ field: "id", value: "a" }] },
				],
			}),
		).rejects.toThrow(/duplicate ids/);
	});

	it("throws when a row is missing a case-sensitive id equality", async () => {
		const adapter = createTestAdapter({
			adapter: createCustomAdapter(),
		});
		await expect(
			adapter.incrementMany({
				model: "verification",
				increment: { attempts: 1 },
				rows: [{ where: [{ field: "identifier", value: "token" }] }],
			}),
		).rejects.toThrow(/case-sensitive `id`/);
		await expect(
			adapter.incrementMany({
				model: "verification",
				increment: { attempts: 1 },
				rows: [
					{
						where: [{ field: "id", value: "a", mode: "insensitive" }],
					},
				],
			}),
		).rejects.toThrow(/case-sensitive `id`/);
	});

	it("falls back to sequential incrementOne in id order and omits misses", async () => {
		const seen: string[] = [];
		const adapter = createTestAdapter({
			adapter: createCustomAdapter({
				incrementOne: async <T>({ where }: { where: Required<Where>[] }) => {
					const id = where.find((clause) => clause.field === "id")?.value;
					if (typeof id === "string") seen.push(id);
					if (id === "miss") return null;
					return { id, identifier_text: "stored-token" } as T;
				},
			}),
		});
		const result = await adapter.incrementMany<{
			id: string;
			identifier: string;
		}>({
			model: "verification",
			increment: { attempts: 1 },
			rows: [
				{ where: [{ field: "id", value: "c" }] },
				{ where: [{ field: "id", value: "miss" }] },
				{ where: [{ field: "id", value: "a" }] },
			],
		});
		expect(seen).toEqual(["a", "c", "miss"]);
		expect(result.map((row) => row.id)).toEqual(["a", "c"]);
	});

	it("chunks by bind count so (id, extra) stays under the parameter cap", async () => {
		const incrementMany = vi.fn(async ({ rows }: { rows: unknown[] }) => rows);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				incrementManyMaxParameters: 999,
			},
			adapter: () =>
				createCustomAdapter({
					incrementMany: incrementMany as CustomAdapter["incrementMany"],
				}),
		})({});
		const rows = Array.from({ length: 1000 }, (_, index) => ({
			where: [
				{ field: "id", value: `id-${index}` },
				{ field: "name", value: "token" },
			],
		}));
		await adapter.incrementMany({
			model: "user",
			increment: {},
			set: { name: "token" },
			rows,
		});
		// `name` plus transformed `updatedAt` are assignment binds, so 498 not 499.
		expect(
			incrementMany.mock.calls.map((call) => call[0]?.rows.length),
		).toEqual([498, 498, 4]);
	});

	it("counts increment and set binds when chunking under the SQLite cap", async () => {
		const incrementMany = vi.fn(async ({ rows }: { rows: unknown[] }) => rows);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				incrementManyMaxParameters: 20,
			},
			adapter: () =>
				createCustomAdapter({
					incrementMany: incrementMany as CustomAdapter["incrementMany"],
				}),
		})({
			user: {
				additionalFields: {
					attempts: { type: "number", required: false },
				},
			},
		});
		const rows = Array.from({ length: 20 }, (_, index) => ({
			where: [
				{ field: "id", value: `id-${index}` },
				{ field: "name", value: "token" },
			],
		}));
		await adapter.incrementMany({
			model: "user",
			increment: { attempts: 1 },
			set: { name: "token" },
			rows,
		});
		// 2 where binds + `attempts`, `name`, and `updatedAt` assignment binds:
		// (20 - 3) / 2 = 8.
		expect(
			incrementMany.mock.calls.map((call) => call[0]?.rows.length),
		).toEqual([8, 8, 4]);
	});

	it("runs native incrementMany chunks inside one transaction", async () => {
		const order: string[] = [];
		const innerIncrementMany = vi.fn(
			async ({ rows }: { rows: Array<{ where: Required<Where>[] }> }) => {
				order.push(`chunk:${rows.length}`);
				return rows.map((row) => ({ id: row.where[0]?.value }));
			},
		);
		const transaction = vi.fn(
			async (
				cb: (trx: ReturnType<typeof createTestAdapter>) => Promise<unknown>,
			) => {
				order.push("begin");
				const trx = createAdapterFactory<BetterAuthOptions>({
					config: {
						adapterId: "trx-adapter",
						incrementManyMaxParameters: 7,
						transaction: false,
					},
					adapter: () =>
						createCustomAdapter({
							incrementMany:
								innerIncrementMany as CustomAdapter["incrementMany"],
						}),
				})({});
				try {
					const result = await cb(trx);
					order.push("commit");
					return result;
				} catch (error) {
					order.push("rollback");
					throw error;
				}
			},
		);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				incrementManyMaxParameters: 7,
				transaction: transaction as never,
			},
			adapter: () =>
				createCustomAdapter({
					incrementMany: async () => {
						throw new Error("outer native incrementMany should not run");
					},
				}),
		})({});
		const rows = Array.from({ length: 5 }, (_, index) => ({
			where: [
				{ field: "id", value: `id-${index}` },
				{ field: "name", value: "token" },
			],
		}));
		await adapter.incrementMany({
			model: "user",
			increment: {},
			set: { name: "token" },
			rows,
		});
		expect(order[0]).toBe("begin");
		expect(order.at(-1)).toBe("commit");
		expect(order.filter((step) => step.startsWith("chunk:"))).toEqual([
			"chunk:2",
			"chunk:2",
			"chunk:1",
		]);
	});

	it("runs sequential incrementOne fallback for multiple rows inside a transaction", async () => {
		const order: string[] = [];
		const incrementOne = async <T>({ where }: { where: Required<Where>[] }) => {
			const id = where.find((clause) => clause.field === "id")?.value;
			order.push(`one:${String(id)}`);
			return { id } as T;
		};
		const transaction = vi.fn(
			async (
				cb: (trx: ReturnType<typeof createTestAdapter>) => Promise<unknown>,
			) => {
				order.push("begin");
				const trx = createAdapterFactory<BetterAuthOptions>({
					config: {
						adapterId: "trx-adapter",
						transaction: false,
					},
					adapter: () => createCustomAdapter({ incrementOne }),
				})({});
				const result = await cb(trx);
				order.push("commit");
				return result;
			},
		);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				transaction: transaction as never,
			},
			adapter: () =>
				createCustomAdapter({
					incrementOne: async () => {
						throw new Error("outer incrementOne should not run");
					},
				}),
		})({});
		await adapter.incrementMany({
			model: "user",
			increment: {},
			set: { name: "token" },
			rows: [
				{ where: [{ field: "id", value: "b" }] },
				{ where: [{ field: "id", value: "a" }] },
			],
		});
		expect(order).toEqual(["begin", "one:a", "one:b", "commit"]);
	});

	it("appends native incrementMany results without spreading the chunk", async () => {
		const incrementMany = vi.fn(
			async ({ rows }: { rows: Array<{ where: Required<Where>[] }> }) => {
				const oversized = Array.from({ length: rows.length }, (_, index) => ({
					id: `id-${index}`,
				}));
				oversized.push = () => {
					throw new Error("spread exceeded the argument limit");
				};
				return oversized;
			},
		);
		const adapter = createAdapterFactory<BetterAuthOptions>({
			config: {
				adapterId: "test-adapter",
				incrementManyMaxParameters: Number.MAX_SAFE_INTEGER,
			},
			adapter: () =>
				createCustomAdapter({
					incrementMany: incrementMany as CustomAdapter["incrementMany"],
				}),
		})({});
		const rows = Array.from({ length: 3 }, (_, index) => ({
			where: [{ field: "id", value: `id-${index}` }],
		}));
		const result = await adapter.incrementMany<{ id: string }>({
			model: "user",
			increment: {},
			set: { name: "token" },
			rows,
		});
		expect(result).toHaveLength(3);
	});
});
