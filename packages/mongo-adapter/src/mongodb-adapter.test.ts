import { logger } from "@better-auth/core/env";
import type { Db } from "mongodb";
import {
	MongoClient,
	MongoErrorLabel,
	MongoServerError,
	ObjectId,
	UUID,
} from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { mongodbAdapter } from "./mongodb-adapter";

describe("mongodb-adapter", () => {
	it("should create mongodb adapter", () => {
		const db = {
			collection: vi.fn(),
		} as any;
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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11554
	 */
	it("aborts a transaction whose commit did not complete", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commitError = new MongoServerError({
			errmsg: "commit did not complete",
		});
		const commit = vi
			.spyOn(session, "commitTransaction")
			.mockRejectedValue(commitError);
		// Once a commit has been attempted the driver stops reporting the session
		// as being in a transaction, even when the commit never reached the server.
		vi.spyOn(session, "inTransaction").mockReturnValue(false);
		const abort = vi.spyOn(session, "abortTransaction");
		const end = vi.spyOn(session, "endSession");
		const db = client.db("test");
		const command = vi.fn().mockResolvedValue({ ok: 1 });
		vi.spyOn(client, "db").mockReturnValue({ command } as unknown as Db);
		const adapter = mongodbAdapter(db, { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(transaction(async () => "ok")).rejects.toBe(commitError);
		expect(commit).toHaveBeenCalledOnce();
		expect(abort).not.toHaveBeenCalled();
		expect(command).toHaveBeenCalledWith({ abortTransaction: 1 }, { session });
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	it("preserves the commit error when the transaction is already gone", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commitError = new MongoServerError({
			errmsg: "commit did not complete",
		});
		vi.spyOn(session, "commitTransaction").mockRejectedValue(commitError);
		vi.spyOn(session, "inTransaction").mockReturnValue(false);
		const end = vi.spyOn(session, "endSession");
		const db = client.db("test");
		// NoSuchTransaction: the server has nothing left open, so the abort
		// failing must not replace the error the caller needs to see.
		const command = vi.fn().mockRejectedValue(
			Object.assign(new MongoServerError({ errmsg: "no such transaction" }), {
				code: 251,
			}),
		);
		vi.spyOn(client, "db").mockReturnValue({ command } as unknown as Db);
		const adapter = mongodbAdapter(db, { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(transaction(async () => "ok")).rejects.toBe(commitError);
		expect(command).toHaveBeenCalledOnce();
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	it("does not send an abort when the failure came before the commit", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commit = vi.spyOn(session, "commitTransaction");
		// A transaction that never started leaves nothing open on the server, and
		// reports itself the same way a failed commit does.
		vi.spyOn(session, "inTransaction").mockReturnValue(false);
		const abort = vi.spyOn(session, "abortTransaction");
		const end = vi.spyOn(session, "endSession");
		const db = client.db("test");
		const command = vi.fn().mockResolvedValue({ ok: 1 });
		vi.spyOn(client, "db").mockReturnValue({ command } as unknown as Db);
		const adapter = mongodbAdapter(db, { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		const callbackError = new Error("the work failed");
		await expect(
			transaction(async () => {
				throw callbackError;
			}),
		).rejects.toBe(callbackError);
		expect(commit).not.toHaveBeenCalled();
		// `withTransaction` aborts a failed callback itself; no raw command is needed.
		expect(abort).toHaveBeenCalledOnce();
		expect(command).not.toHaveBeenCalled();
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	it("retries the abort once when it fails with a retryable write", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const session = client.startSession();
		vi.spyOn(client, "startSession").mockReturnValue(session);
		const commitError = new MongoServerError({
			errmsg: "commit did not complete",
		});
		vi.spyOn(session, "commitTransaction").mockRejectedValue(commitError);
		vi.spyOn(session, "inTransaction").mockReturnValue(false);
		const end = vi.spyOn(session, "endSession");
		const db = client.db("test");
		// The driver retries `abortTransaction()` itself on a transient error, so
		// the raw command has to do the same or the transaction stays open.
		const retryable = new MongoServerError({ errmsg: "connection reset" });
		retryable.addErrorLabel(MongoErrorLabel.RetryableWriteError);
		const command = vi
			.fn()
			.mockRejectedValueOnce(retryable)
			.mockResolvedValueOnce({ ok: 1 });
		vi.spyOn(client, "db").mockReturnValue({ command } as unknown as Db);
		const adapter = mongodbAdapter(db, { client })({});
		const transaction = adapter.options?.adapterConfig.transaction;
		if (typeof transaction !== "function") {
			throw new Error("MongoDB transaction is not configured");
		}

		await expect(transaction(async () => "ok")).rejects.toBe(commitError);
		expect(command).toHaveBeenCalledTimes(2);
		expect(end).toHaveBeenCalledOnce();
		await client.close();
	});

	it("creates configured compound indexes before the first write", async () => {
		let resolveIndexSetup: (indexName: string) => void = () => {};
		const indexSetup = new Promise<string>((resolve) => {
			resolveIndexSetup = resolve;
		});
		const createIndex = vi.fn((keys: Record<string, number>) =>
			"connection_id" in keys ? indexSetup : Promise.resolve("field_index"),
		);
		const compoundIndexCalls = () =>
			createIndex.mock.calls.filter(([keys]) => "connection_id" in keys);
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
		expect(compoundIndexCalls()).toHaveLength(1);
		expect(insertOne).not.toHaveBeenCalled();

		resolveIndexSetup("connection_id_1_external_id_1");
		await Promise.all([firstCreate, secondCreate]);

		expect(compoundIndexCalls()).toHaveLength(1);
		expect(insertOne).toHaveBeenCalledTimes(2);
	});

	it("resolves configured indexes once per model", async () => {
		let indexFieldReads = 0;
		const createIndex = vi.fn(
			async (_keys: Record<string, number>) => "connection_id_1_external_id_1",
		);
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
		expect(
			createIndex.mock.calls.filter(([keys]) => "connectionId" in keys),
		).toHaveLength(1);
		expect(insertOne).toHaveBeenCalledTimes(2);
	});

	it("does not create indexes for tables with migrations disabled", async () => {
		const createIndex = vi.fn(
			async (_keys: Record<string, number>) => "field_index",
		);
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

		expect(
			createIndex.mock.calls.some(([keys]) => "connectionId" in keys),
		).toBe(false);
		expect(insertOne).toHaveBeenCalledOnce();
	});

	it("allows duplicate cleanup before the first index-enforcing mutation", async () => {
		const createIndex = vi.fn(
			async (_keys: Record<string, number>) => "field_index",
		);
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

		expect(
			createIndex.mock.calls.some(([keys]) => "connectionId" in keys),
		).toBe(false);
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
		} as any;
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

	const rateLimitOptions = { rateLimit: { storage: "database" } } as any;

	it("incrementOne applies $inc and $set atomically against the guard filter", async () => {
		const findOneAndUpdate = vi.fn(async () => ({
			value: { _id: "counter-id", count: 4, lastRequest: 1700000000000 },
		}));
		const db = {
			collection: vi.fn(() => ({
				findOneAndUpdate,
			})),
		} as any;
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
		} as any;
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
		const updateArg = (findOneAndUpdate.mock.calls[0] as any[])[1];
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
		} as any;
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
		const updateArg = (findOneAndUpdate.mock.calls[0] as any[])[1];
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
		} as any;
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
		} as any;
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

describe("transactions", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/11514
	 * @see https://www.mongodb.com/docs/manual/core/transactions-in-applications/
	 */
	it("retries the callback when MongoDB aborts the transaction with a transient error", async () => {
		const client = new MongoClient("mongodb://localhost:27017");
		const adapter = mongodbAdapter(client.db("test"), { client })({});
		let attempts = 0;

		const result = await adapter.transaction(async () => {
			attempts += 1;
			if (attempts === 1) {
				const writeConflict = new MongoServerError({ errmsg: "WriteConflict" });
				writeConflict.addErrorLabel(MongoErrorLabel.TransientTransactionError);
				throw writeConflict;
			}
			return "committed";
		});

		expect(result).toBe("committed");
		expect(attempts).toBe(2);
		await client.close();
	});
});

describe("uuid support", () => {
	const uuidRegex =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	const uuid = "550e8400-e29b-41d4-a716-446655440000";

	function createMockDb() {
		const insertedDocs: any[] = [];
		const updatedFilters: any[] = [];
		const updatedValues: any[] = [];

		const collection = vi.fn(() => ({
			insertOne: vi.fn(async (doc: any) => {
				insertedDocs.push(doc);
				return { insertedId: doc._id };
			}),
			aggregate: vi.fn(() => ({
				toArray: vi.fn(async () => {
					return [];
				}),
			})),
			findOneAndUpdate: vi.fn(async (filter: any, update: any) => {
				updatedFilters.push(filter);
				updatedValues.push(update);
				return { value: { ...update.$set, _id: filter._id } };
			}),
			deleteOne: vi.fn(async () => {}),
		}));

		return {
			db: { collection } as any,
			insertedDocs,
			updatedFilters,
			updatedValues,
		};
	}

	function createAdapter(
		db: any,
		generateId: "uuid" | (() => string) | undefined,
	) {
		const adapterFactory = mongodbAdapter(db, { transaction: false });
		return adapterFactory({
			database: {} as any,
			advanced: {
				database: {
					...(generateId !== undefined ? { generateId } : {}),
				},
			},
		} as any);
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
		expect(insertedDocs[0]._id).toBeInstanceOf(UUID);
		expect(insertedDocs[0]._id.toString()).toMatch(uuidRegex);
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
		expect(insertedDocs[0]._id).toBeInstanceOf(UUID);
		expect(insertedDocs[0].userId).toBeInstanceOf(UUID);
		expect(insertedDocs[0].userId.toString()).toBe(uuid);
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
		expect(insertedDocs[0]._id).toBeInstanceOf(ObjectId);
	});

	it("should convert BSON UUID to string in output", async () => {
		const bsonUuid = new UUID(uuid);
		const { db } = createMockDb();

		// Override aggregate to return a document with BSON UUID
		(db.collection as any).mockReturnValue({
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
 * @see https://github.com/better-auth/better-auth/issues/12296
 */
describe("field-level indexes", () => {
	type IndexOptions = {
		name: string;
		unique: boolean;
		partialFilterExpression?: Record<string, unknown>;
	};
	type CreateIndex = (
		keys: Record<string, number>,
		options: IndexOptions,
	) => Promise<string>;

	const createMockDb = (
		createIndex: CreateIndex = async (_keys, options) => options.name,
		existingIndexes: Record<string, unknown>[] = [],
	) => {
		const calls: string[] = [];
		const createIndexMock = vi.fn(
			async (keys: Record<string, number>, options: IndexOptions) => {
				calls.push(`createIndex ${options.name}`);
				return createIndex(keys, options);
			},
		);
		const insertOne = vi.fn(async (document: Record<string, unknown>) => {
			calls.push("insertOne");
			return { insertedId: document._id };
		});
		const aggregate = vi.fn(() => {
			calls.push("aggregate");
			return { toArray: async () => [] };
		});
		const listIndexes = vi.fn(() => ({
			toArray: async () => existingIndexes,
		}));
		const db = {
			collection: vi.fn(() => ({
				aggregate,
				createIndex: createIndexMock,
				insertOne,
				listIndexes,
			})),
		};
		return {
			db: db as unknown as Db,
			calls,
			createIndex: createIndexMock,
			insertOne,
		};
	};
	const indexCalls = (
		createIndex: ReturnType<typeof createMockDb>["createIndex"],
		name: string,
	) => createIndex.mock.calls.filter(([, options]) => options.name === name);
	const user = (email: string) => ({
		name: "Test User",
		email,
		emailVerified: false,
		createdAt: new Date(),
		updatedAt: new Date(),
	});
	const serverError = (code: number) =>
		new MongoServerError({ errmsg: `server error ${code}`, code });

	it("creates a unique index for each unique field before the first write", async () => {
		const { db, calls, createIndex } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.create({ model: "user", data: user("a@example.com") });
		await adapter.create({ model: "user", data: user("b@example.com") });

		expect(indexCalls(createIndex, "user_email_uidx")).toEqual([
			[{ email: 1 }, { name: "user_email_uidx", unique: true }],
		]);
		expect(indexCalls(createIndex, "session_token_uidx")).toHaveLength(1);
		expect(calls.indexOf("insertOne")).toBe(createIndex.mock.calls.length);
		expect(calls.filter((call) => call === "insertOne")).toHaveLength(2);
	});

	it("creates field indexes before the first read", async () => {
		const { db, calls } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.findOne({
			model: "session",
			where: [{ field: "token", value: "token" }],
		});

		expect(calls).toContain("createIndex user_email_uidx");
		expect(calls).toContain("createIndex session_token_uidx");
		expect(calls.at(-1)).toBe("aggregate");
	});

	it("uses configured field and model names", async () => {
		const { db, createIndex } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({
			session: { modelName: "sessions", fields: { token: "session_token" } },
		});

		await adapter.create({
			model: "session",
			data: {
				token: "token",
				userId: new ObjectId().toHexString(),
				expiresAt: new Date(),
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});

		expect(db.collection).toHaveBeenCalledWith("sessions");
		expect(createIndex).toHaveBeenCalledWith(
			{ session_token: 1 },
			{ name: "sessions_session_token_uidx", unique: true },
		);
		expect(createIndex).toHaveBeenCalledWith(
			{ userId: 1 },
			{ name: "sessions_userId_idx", unique: false },
		);
	});

	it("only enforces optional unique fields on documents that have a value", async () => {
		const { db, createIndex } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({
			plugins: [
				{
					id: "handles",
					schema: {
						user: {
							fields: {
								handle: { type: "string", required: false, unique: true },
								tier: {
									type: ["free", "pro"],
									required: false,
									unique: true,
								},
								badge: {
									type: "number",
									required: false,
									unique: true,
									references: { model: "badge", field: "number" },
								},
								partnerId: {
									type: "string",
									required: false,
									unique: true,
									references: { model: "user", field: "id" },
								},
								settings: { type: "json", required: false, unique: true },
							},
						},
					},
				},
			],
		});

		await adapter.create({ model: "user", data: user("a@example.com") });

		const partialFilterFor = (name: string) =>
			indexCalls(createIndex, name)[0]?.[1].partialFilterExpression;
		expect(partialFilterFor("user_handle_uidx")).toEqual({
			handle: { $type: "string" },
		});
		expect(partialFilterFor("user_tier_uidx")).toEqual({
			tier: { $type: "string" },
		});
		expect(partialFilterFor("user_badge_uidx")).toEqual({
			badge: { $type: "number" },
		});
		expect(partialFilterFor("user_partnerId_uidx")).toEqual({
			partnerId: { $type: ["string", "objectId", "binData"] },
		});
		expect(indexCalls(createIndex, "user_settings_uidx")).toHaveLength(0);
	});

	it("does not let a non-unique table index replace a unique field index", async () => {
		const { db, createIndex } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({
			plugins: [
				{
					id: "lookup",
					schema: {
						member: {
							fields: {
								code: { type: "string", unique: true },
								slug: { type: "string", index: true },
							},
							indexes: [
								{ fields: ["code"], name: "member_code_lookup" },
								{ fields: ["slug"], name: "member_slug_lookup" },
							],
						},
					},
				},
			],
		});

		await adapter.create({ model: "member", data: { code: "a", slug: "a" } });

		expect(createIndex).toHaveBeenCalledWith(
			{ code: 1 },
			{ name: "member_code_uidx", unique: true },
		);
		expect(indexCalls(createIndex, "member_slug_idx")).toHaveLength(0);
	});

	it("does not create field indexes for tables with migrations disabled", async () => {
		const { db, createIndex, insertOne } = createMockDb();
		const adapter = mongodbAdapter(db, { transaction: false })({
			plugins: [
				{
					id: "external",
					schema: {
						externalUser: {
							modelName: "external_user",
							disableMigration: true,
							fields: { code: { type: "string", unique: true } },
						},
					},
				},
			],
		});

		await adapter.create({
			model: "externalUser",
			data: { code: "a" },
		});

		expect(indexCalls(createIndex, "external_user_code_uidx")).toHaveLength(0);
		expect(insertOne).toHaveBeenCalledOnce();
	});

	it("logs existing duplicates once and keeps accepting writes", async () => {
		const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
		const duplicate = serverError(11000);
		const { db, createIndex, insertOne } = createMockDb(
			async (keys, options) => {
				if ("email" in keys) throw duplicate;
				return options.name;
			},
		);
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.create({ model: "user", data: user("a@example.com") });
		await adapter.create({ model: "user", data: user("b@example.com") });

		expect(insertOne).toHaveBeenCalledTimes(2);
		expect(indexCalls(createIndex, "user_email_uidx")).toHaveLength(1);
		expect(errorLog).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining(
				'"user_email_uidx" on user.email because the collection already contains duplicate values',
			),
			duplicate,
		);
		errorLog.mockRestore();
	});

	it("accepts an equivalent index that exists under another name", async () => {
		const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
		const { db, createIndex, insertOne } = createMockDb(
			async (keys, options) => {
				if ("email" in keys) throw serverError(85);
				return options.name;
			},
			[{ key: { email: 1 }, name: "email_1", unique: true }],
		);
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.create({ model: "user", data: user("a@example.com") });
		await adapter.create({ model: "user", data: user("b@example.com") });

		expect(indexCalls(createIndex, "user_email_uidx")).toHaveLength(1);
		expect(insertOne).toHaveBeenCalledTimes(2);
		expect(errorLog).not.toHaveBeenCalled();
		errorLog.mockRestore();
	});

	it("logs a same-key index that does not enforce uniqueness", async () => {
		const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
		const conflict = serverError(85);
		const { db, insertOne } = createMockDb(
			async (keys, options) => {
				if ("email" in keys) throw conflict;
				return options.name;
			},
			[{ key: { email: 1 }, name: "email_1" }],
		);
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.create({ model: "user", data: user("a@example.com") });

		expect(insertOne).toHaveBeenCalledOnce();
		expect(errorLog).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining(
				'the index "email_1" has the same key and different options',
			),
			conflict,
		);
		errorLog.mockRestore();
	});

	it.each([
		["a network error", () => new Error("connection reset")],
		["a primary step down", () => serverError(189)],
	])("retries index creation after %s", async (_label, makeError) => {
		const errorLog = vi.spyOn(logger, "error").mockImplementation(() => {});
		let emailAttempts = 0;
		const { db, createIndex, insertOne } = createMockDb(
			async (keys, options) => {
				if ("email" in keys && emailAttempts++ === 0) throw makeError();
				return options.name;
			},
		);
		const adapter = mongodbAdapter(db, { transaction: false })({});

		await adapter.create({ model: "user", data: user("a@example.com") });
		await adapter.create({ model: "user", data: user("b@example.com") });
		await adapter.create({ model: "user", data: user("c@example.com") });

		expect(indexCalls(createIndex, "user_email_uidx")).toHaveLength(2);
		expect(indexCalls(createIndex, "session_token_uidx")).toHaveLength(1);
		expect(insertOne).toHaveBeenCalledTimes(3);
		expect(errorLog).toHaveBeenCalledOnce();
		errorLog.mockRestore();
	});
});
