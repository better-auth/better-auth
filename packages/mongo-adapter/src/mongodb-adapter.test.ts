import type { BetterAuthOptions } from "@better-auth/core";
import type { Db } from "mongodb";
import { MongoClient, MongoServerError, ObjectId, UUID } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { mongodbAdapter } from "./mongodb-adapter";

describe("mongodb-adapter", () => {
	it("should create mongodb adapter", () => {
		const db = {
			collection: vi.fn(),
		} as unknown as Db;
		const adapter = mongodbAdapter(db);
		expect(adapter).toBeDefined();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/10925
	 */
	it("preserves the commit error without aborting a committed MongoDB session", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commitTransaction = session.commitTransaction.bind(session);
		const commitError = new MongoServerError({ errmsg: "commit failed" });
		const commit = vi
			.spyOn(session, "commitTransaction")
			.mockImplementation(async () => {
				await commitTransaction();
				throw commitError;
			});
		const abort = vi.spyOn(session, "abortTransaction");
		const end = vi.spyOn(session, "endSession");
		const adapter = mongodbAdapter(client.db("test"), { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(transaction(async () => "ok")).rejects.toBe(commitError);
		expect(commit).toHaveBeenCalledOnce();
		expect(abort).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	it("aborts the MongoDB transaction when an operation fails before commit", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commit = vi.spyOn(session, "commitTransaction");
		const abort = vi.spyOn(session, "abortTransaction");
		const end = vi.spyOn(session, "endSession");
		const operationError = new Error("operation failed");
		const adapter = mongodbAdapter(client.db("test"), { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(
			transaction(async () => {
				throw operationError;
			}),
		).rejects.toBe(operationError);
		expect(abort).toHaveBeenCalledOnce();
		expect(commit).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	/**
	 * @see https://github.com/mongodb/specifications/blob/master/source/transactions/transactions.md#aborttransaction
	 */
	it("preserves a transaction start error when no transaction is active", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession({ snapshot: true });
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const abort = vi.spyOn(session, "abortTransaction");
		const adapter = mongodbAdapter(client.db("test"), { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(transaction(async () => "ok")).rejects.toThrow(
			"Transactions are not supported in snapshot sessions",
		);
		expect(abort).not.toHaveBeenCalled();
		expect(session.hasEnded).toBe(true);
		await client.close();
	});

	it("creates configured compound indexes before the first write", async () => {
		let resolveIndexSetup: (indexName: string) => void = () => {};
		const indexSetup = new Promise<string>((resolve) => {
			resolveIndexSetup = resolve;
		});
		const createIndex = vi.fn(() => indexSetup);
		const insertOne = vi.fn(async (document: Record<string, unknown>) => ({
			insertedId: document._id,
		}));
		const db = {
			collection: vi.fn(() => ({ createIndex, insertOne })),
		};
		const adapter = mongodbAdapter(db as unknown as Db, {
			transaction: false,
		})({
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							modelName: "directory_user",
							fields: {
								connectionId: {
									type: "string",
									fieldName: "connection_id",
								},
								externalId: {
									type: "string",
									fieldName: "external_id",
								},
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		const firstCreate = adapter.create({
			model: "directoryUser",
			data: { connectionId: "okta", externalId: "employee-1" },
		});
		const secondCreate = adapter.create({
			model: "directoryUser",
			data: { connectionId: "okta", externalId: "employee-2" },
		});

		await vi.waitFor(() => {
			expect(createIndex).toHaveBeenCalledWith(
				{ connection_id: 1, external_id: 1 },
				{
					name: "directory_user_connection_id_external_id_uidx",
					unique: true,
				},
			);
		});
		expect(db.collection).toHaveBeenCalledWith("directory_user");
		expect(createIndex).toHaveBeenCalledOnce();
		expect(insertOne).not.toHaveBeenCalled();

		resolveIndexSetup("connection_id_1_external_id_1");
		await Promise.all([firstCreate, secondCreate]);

		expect(createIndex).toHaveBeenCalledOnce();
		expect(insertOne).toHaveBeenCalledTimes(2);
	});

	it("resolves configured indexes once per model", async () => {
		let indexFieldReads = 0;
		const createIndex = vi.fn(async () => "connection_id_1_external_id_1");
		const insertOne = vi.fn(async (document: Record<string, unknown>) => ({
			insertedId: document._id,
		}));
		const db = {
			collection: vi.fn(() => ({ createIndex, insertOne })),
		};
		const adapter = mongodbAdapter(db as unknown as Db, {
			transaction: false,
		})({
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								connectionId: { type: "string" },
								externalId: { type: "string" },
							},
							indexes: [
								{
									get fields() {
										indexFieldReads++;
										return ["connectionId", "externalId"] as const;
									},
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		await adapter.create({
			model: "directoryUser",
			data: { connectionId: "okta", externalId: "employee-1" },
		});
		const readsAfterFirstWrite = indexFieldReads;

		await adapter.create({
			model: "directoryUser",
			data: { connectionId: "okta", externalId: "employee-2" },
		});

		expect(indexFieldReads).toBe(readsAfterFirstWrite);
		expect(createIndex).toHaveBeenCalledOnce();
		expect(insertOne).toHaveBeenCalledTimes(2);
	});

	it("does not create indexes for tables with migrations disabled", async () => {
		const createIndex = vi.fn();
		const insertOne = vi.fn(async (document: Record<string, unknown>) => ({
			insertedId: document._id,
		}));
		const db = {
			collection: vi.fn(() => ({ createIndex, insertOne })),
		};
		const adapter = mongodbAdapter(db as unknown as Db, {
			transaction: false,
		})({
			plugins: [
				{
					id: "externally-managed-directory",
					schema: {
						directoryUser: {
							disableMigration: true,
							fields: {
								connectionId: { type: "string" },
								externalId: { type: "string" },
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		await adapter.create({
			model: "directoryUser",
			data: { connectionId: "okta", externalId: "employee-1" },
		});

		expect(createIndex).not.toHaveBeenCalled();
		expect(insertOne).toHaveBeenCalledOnce();
	});

	it("allows duplicate cleanup before the first index-enforcing mutation", async () => {
		const createIndex = vi.fn();
		const deleteMany = vi.fn(async () => ({ deletedCount: 2 }));
		const db = {
			collection: vi.fn(() => ({ createIndex, deleteMany })),
		};
		const adapter = mongodbAdapter(db as unknown as Db, {
			transaction: false,
		})({
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								connectionId: { type: "string" },
								externalId: { type: "string" },
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		await expect(
			adapter.deleteMany({
				model: "directoryUser",
				where: [{ field: "connectionId", value: "duplicate" }],
			}),
		).resolves.toBe(2);

		expect(createIndex).not.toHaveBeenCalled();
		expect(deleteMany).toHaveBeenCalledOnce();
	});

	it("consumeOne returns the deleted document from Mongo metadata", async () => {
		const deleted = {
			_id: "verification-id",
			identifier: "magic-link-token",
		};
		const findOneAndDelete = vi.fn(async () => ({ value: deleted }));
		const db = {
			collection: vi.fn(() => ({
				findOneAndDelete,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })({});

		const result = await adapter.consumeOne({
			model: "verification",
			where: [{ field: "identifier", value: "magic-link-token" }],
		});

		expect(result).toMatchObject({
			id: "verification-id",
			identifier: "magic-link-token",
		});
		expect(findOneAndDelete).toHaveBeenCalledWith(
			{ identifier: "magic-link-token" },
			expect.objectContaining({ includeResultMetadata: true }),
		);
	});

	const rateLimitOptions = {
		rateLimit: { storage: "database" },
	} as unknown as BetterAuthOptions;

	it("incrementOne applies $inc and $set atomically against the guard filter", async () => {
		const findOneAndUpdate = vi.fn(async () => ({
			value: { _id: "counter-id", count: 4, lastRequest: 1700000000000 },
		}));
		const db = {
			collection: vi.fn(() => ({
				findOneAndUpdate,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })(
			rateLimitOptions,
		);

		const result = await adapter.incrementOne({
			model: "rateLimit",
			where: [{ field: "count", value: 5, operator: "lt" }],
			increment: { count: 1 },
			set: { lastRequest: 1700000000000 },
		});

		expect(result).toMatchObject({
			id: "counter-id",
			count: 4,
			lastRequest: 1700000000000,
		});
		expect(findOneAndUpdate).toHaveBeenCalledWith(
			{ count: { $lt: 5 } },
			{ $inc: { count: 1 }, $set: { lastRequest: 1700000000000 } },
			expect.objectContaining({
				returnDocument: "after",
				includeResultMetadata: true,
			}),
		);
	});

	it("incrementOne omits $set when no absolute assignments are provided", async () => {
		const findOneAndUpdate = vi.fn(async () => ({
			value: { _id: "counter-id", count: 11 },
		}));
		const db = {
			collection: vi.fn(() => ({
				findOneAndUpdate,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })(
			rateLimitOptions,
		);

		await adapter.incrementOne({
			model: "rateLimit",
			where: [{ field: "key", value: "a" }],
			increment: { count: 1 },
		});

		expect(findOneAndUpdate).toHaveBeenCalledWith(
			{ key: "a" },
			{ $inc: { count: 1 } },
			expect.anything(),
		);
		const updateArg = (
			findOneAndUpdate.mock.calls[0] as unknown[]
		)[1] as Record<string, unknown>;
		expect(updateArg).not.toHaveProperty("$set");
	});

	it("incrementOne omits $inc for guarded set-only updates", async () => {
		const findOneAndUpdate = vi.fn(async () => ({
			value: { _id: "counter-id", count: 11, lastRequest: 1700000000000 },
		}));
		const db = {
			collection: vi.fn(() => ({
				findOneAndUpdate,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })(
			rateLimitOptions,
		);

		const result = await adapter.incrementOne({
			model: "rateLimit",
			where: [{ field: "key", value: "a" }],
			increment: {},
			set: { lastRequest: 1700000000000 },
		});

		expect(result).toMatchObject({
			id: "counter-id",
			count: 11,
			lastRequest: 1700000000000,
		});
		expect(findOneAndUpdate).toHaveBeenCalledWith(
			{ key: "a" },
			{ $set: { lastRequest: 1700000000000 } },
			expect.objectContaining({
				returnDocument: "after",
				includeResultMetadata: true,
			}),
		);
		const updateArg = (
			findOneAndUpdate.mock.calls[0] as unknown[]
		)[1] as Record<string, unknown>;
		expect(updateArg).not.toHaveProperty("$inc");
	});

	it("incrementOne rejects an empty guarded update", async () => {
		const findOne = vi.fn(async () => ({ _id: "counter-id", count: 11 }));
		const findOneAndUpdate = vi.fn();
		const db = {
			collection: vi.fn(() => ({
				findOne,
				findOneAndUpdate,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })(
			rateLimitOptions,
		);

		await expect(
			adapter.incrementOne({
				model: "rateLimit",
				where: [{ field: "key", value: "a" }],
				increment: {},
			}),
		).rejects.toThrow(
			"incrementOne requires a non-empty `increment` or `set`; both were empty.",
		);

		expect(findOne).not.toHaveBeenCalled();
		expect(findOneAndUpdate).not.toHaveBeenCalled();
	});

	it("incrementOne returns null when the guard matches no document", async () => {
		const findOneAndUpdate = vi.fn(async () => ({ value: null }));
		const db = {
			collection: vi.fn(() => ({
				findOneAndUpdate,
			})),
		} as unknown as Db;
		const adapter = mongodbAdapter(db, { transaction: false })(
			rateLimitOptions,
		);

		const result = await adapter.incrementOne({
			model: "rateLimit",
			where: [{ field: "count", value: 5, operator: "lt" }],
			increment: { count: 1 },
		});

		expect(result).toBeNull();
	});
});

describe("uuid support", () => {
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const uuid = "550e8400-e29b-41d4-a716-446655440000";

	function createMockDb() {
		const insertedDocs: Record<string, unknown>[] = [];
		const updatedFilters: Record<string, unknown>[] = [];
		const updatedValues: Record<string, unknown>[] = [];

		const collection = vi.fn(() => ({
			insertOne: vi.fn(async (doc: Record<string, unknown>) => {
				insertedDocs.push(doc);
				return { insertedId: doc._id };
			}),
			aggregate: vi.fn(() => ({
				toArray: vi.fn(async () => {
					return [];
				}),
			})),
			findOneAndUpdate: vi.fn(
				async (
					filter: Record<string, unknown>,
					update: Record<string, unknown>,
				) => {
					updatedFilters.push(filter);
					updatedValues.push(update);
					return {
						value: {
							...((update.$set as Record<string, unknown> | undefined) ?? {}),
							_id: filter._id,
						},
					};
				},
			),
			deleteOne: vi.fn(async () => {}),
		}));

		return {
			db: { collection } as unknown as Db,
			insertedDocs,
			updatedFilters,
			updatedValues,
		};
	}

	function createAdapter(
		db: Db,
		generateId: "uuid" | (() => string) | undefined,
	) {
		const adapterFactory = mongodbAdapter(db, { transaction: false });
		return adapterFactory({
			database: {},
			advanced: {
				database: {
					...(generateId !== undefined ? { generateId } : {}),
				},
			},
		} as unknown as BetterAuthOptions);
	}

	it("should store _id as BSON UUID when generateId is 'uuid'", async () => {
		const { db, insertedDocs } = createMockDb();
		const adapter = createAdapter(db, "uuid");

		await adapter.create({
			model: "user",
			data: {
				name: "Test",
				email: "test@test.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		expect(insertedDocs.length).toBe(1);
		expect(insertedDocs[0]?._id).toBeInstanceOf(UUID);
		expect((insertedDocs[0]?._id as UUID).toString()).toMatch(uuidRegex);
	});

	it("should store FK fields as BSON UUID when generateId is 'uuid'", async () => {
		const { db, insertedDocs } = createMockDb();
		const adapter = createAdapter(db, "uuid");

		await adapter.create({
			model: "session",
			data: {
				userId: uuid,
				token: "test-token",
				expiresAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		expect(insertedDocs.length).toBe(1);
		expect(insertedDocs[0]?._id).toBeInstanceOf(UUID);
		expect(insertedDocs[0]?.userId).toBeInstanceOf(UUID);
		expect((insertedDocs[0]?.userId as UUID).toString()).toBe(uuid);
	});

	it("should store _id as ObjectId when generateId is not set", async () => {
		const { db, insertedDocs } = createMockDb();
		const adapter = createAdapter(db, undefined);

		await adapter.create({
			model: "user",
			data: {
				name: "Test",
				email: "test@test.com",
				emailVerified: true,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		expect(insertedDocs.length).toBe(1);
		expect(insertedDocs[0]?._id).toBeInstanceOf(ObjectId);
	});

	it("should convert BSON UUID to string in output", async () => {
		const bsonUuid = new UUID(uuid);
		const { db } = createMockDb();

		// Override aggregate to return a document with BSON UUID
		(db.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
			aggregate: vi.fn(() => ({
				toArray: vi.fn(async () => [
					{
						_id: bsonUuid,
						name: "Test",
						email: "test@test.com",
					},
				]),
			})),
		});

		const adapter = createAdapter(db, "uuid");
		const result = await adapter.findOne({
			model: "user",
			where: [{ field: "id", value: uuid }],
		});

		expect(result).not.toBeNull();
		expect((result as Record<string, unknown>).id).toBe(uuid);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/7540
 */
describe("json support", () => {
	it("should store JSON fields as native objects in MongoDB when supportsJSON is true", async () => {
		const insertedDocs: Record<string, unknown>[] = [];
		const insertOne = vi.fn(async (doc: Record<string, unknown>) => {
			insertedDocs.push(doc);
			return { insertedId: doc._id };
		});
		const db = {
			collection: vi.fn(() => ({ insertOne })),
		} as unknown as Db;

		const adapter = mongodbAdapter(db, {
			transaction: false,
			supportsJSON: true,
		})({
			plugins: [
				{
					id: "test",
					schema: {
						testModel: {
							fields: {
								metadata: {
									type: "json",
								},
							},
						},
					},
				},
			],
		});

		const testData = {
			foo: "bar",
			count: 42,
			nested: { role: "admin" },
			tags: ["auth", "mongo"],
		};
		const created = await adapter.create({
			model: "testModel",
			data: {
				metadata: testData,
			},
		});

		expect(insertedDocs).toHaveLength(1);
		expect(typeof insertedDocs[0]?.metadata).toBe("object");
		expect(insertedDocs[0]?.metadata).toEqual(testData);
		expect(created).not.toBeNull();
		expect((created as Record<string, unknown>).metadata).toEqual(testData);
	});

	it("should default supportsJSON to false and store JSON fields as strings when omitted", async () => {
		const insertedDocs: Record<string, unknown>[] = [];
		const insertOne = vi.fn(async (doc: Record<string, unknown>) => {
			insertedDocs.push(doc);
			return { insertedId: doc._id };
		});
		const db = {
			collection: vi.fn(() => ({ insertOne })),
		} as unknown as Db;

		const adapter = mongodbAdapter(db, { transaction: false })({
			plugins: [
				{
					id: "test",
					schema: {
						testModel: {
							fields: {
								metadata: {
									type: "json",
								},
							},
						},
					},
				},
			],
		});

		const testData = { foo: "bar", count: 42 };
		await adapter.create({
			model: "testModel",
			data: {
				metadata: testData,
			},
		});

		expect(insertedDocs).toHaveLength(1);
		expect(typeof insertedDocs[0]?.metadata).toBe("string");
		expect(JSON.parse(insertedDocs[0]?.metadata as string)).toEqual(testData);
	});

	it("should preserve stringification when supportsJSON is explicitly false", async () => {
		const insertedDocs: Record<string, unknown>[] = [];
		const insertOne = vi.fn(async (doc: Record<string, unknown>) => {
			insertedDocs.push(doc);
			return { insertedId: doc._id };
		});
		const db = {
			collection: vi.fn(() => ({ insertOne })),
		} as unknown as Db;

		const adapter = mongodbAdapter(db, {
			transaction: false,
			supportsJSON: false,
		})({
			plugins: [
				{
					id: "test",
					schema: {
						testModel: {
							fields: {
								metadata: {
									type: "json",
								},
							},
						},
					},
				},
			],
		});

		const testData = { foo: "bar", count: 42 };
		await adapter.create({
			model: "testModel",
			data: {
				metadata: testData,
			},
		});

		expect(insertedDocs).toHaveLength(1);
		expect(typeof insertedDocs[0]?.metadata).toBe("string");
		expect(JSON.parse(insertedDocs[0]?.metadata as string)).toEqual(testData);
	});

	it("should parse legacy stringified JSON documents even when supportsJSON is true", async () => {
		const legacyDoc = {
			_id: new ObjectId(),
			metadata: JSON.stringify({ migrated: false, tags: ["legacy", "v1"] }),
		};

		const aggregate = vi.fn(() => ({
			toArray: vi.fn(async () => [legacyDoc]),
		}));
		const db = {
			collection: vi.fn(() => ({ aggregate })),
		} as unknown as Db;

		const adapter = mongodbAdapter(db, {
			transaction: false,
			supportsJSON: true,
		})({
			plugins: [
				{
					id: "test",
					schema: {
						testModel: {
							fields: {
								metadata: {
									type: "json",
								},
							},
						},
					},
				},
			],
		});

		const result = await adapter.findOne({
			model: "testModel",
			where: [{ field: "id", value: legacyDoc._id.toHexString() }],
		});

		expect(result).not.toBeNull();
		expect(typeof (result as Record<string, unknown>).metadata).toBe("object");
		expect((result as Record<string, unknown>).metadata).toEqual({
			migrated: false,
			tags: ["legacy", "v1"],
		});
	});

	it("should safely return raw string without crashing when document contains malformed JSON under supportsJSON: true", async () => {
		const malformedDoc = {
			_id: new ObjectId(),
			metadata: "{ malformed json",
		};

		const aggregate = vi.fn(() => ({
			toArray: vi.fn(async () => [malformedDoc]),
		}));
		const db = {
			collection: vi.fn(() => ({ aggregate })),
		} as unknown as Db;

		const adapter = mongodbAdapter(db, {
			transaction: false,
			supportsJSON: true,
		})({
			plugins: [
				{
					id: "test",
					schema: {
						testModel: {
							fields: {
								metadata: {
									type: "json",
								},
							},
						},
					},
				},
			],
		});

		const result = await adapter.findOne({
			model: "testModel",
			where: [{ field: "id", value: malformedDoc._id.toHexString() }],
		});

		expect(result).not.toBeNull();
		expect((result as Record<string, unknown>).metadata).toBe(
			"{ malformed json",
		);
	});
});
