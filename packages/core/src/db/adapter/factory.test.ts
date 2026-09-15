import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
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
	it.for([
		2,
		-1,
		0.5,
		Number.NaN,
	])("rejects invalid affected counts (%s)", async (count, {
		onTestFinished,
	}) => {
		const { raw, first } = setup(onTestFinished);
		raw.deleteMany = async () => count;
		raw.updateMany = async () => count;
		await expect(first.consumeOne(request)).rejects.toThrow(/affected/);
		await expect(
			first.incrementOne({ ...request, increment: { attempts: 1 } }),
		).rejects.toThrow(/affected/);
	});
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
