import { ObjectId, UUID } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { mongodbAdapter } from "./mongodb-adapter.js";

describe("mongodb-adapter", () => {
	it("should create mongodb adapter", () => {
		const db = {
			collection: vi.fn(),
		} as any;
		const adapter = mongodbAdapter(db);
		expect(adapter).toBeDefined();
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
