import type {
	NodeSavedSession,
	NodeSavedState,
} from "@atproto/oauth-client-node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtprotoAdapter } from "./stores";
import { createSessionStore, createStateStore } from "./stores";

type AdapterStub = AtprotoAdapter & {
	findOne: ReturnType<typeof vi.fn>;
	create: ReturnType<typeof vi.fn>;
	update: ReturnType<typeof vi.fn>;
	delete: ReturnType<typeof vi.fn>;
	deleteMany: ReturnType<typeof vi.fn>;
};

function makeAdapter(): AdapterStub {
	return {
		findOne: vi.fn().mockResolvedValue(null),
		create: vi.fn().mockResolvedValue({ id: "1" }),
		update: vi.fn().mockResolvedValue({}),
		delete: vi.fn().mockResolvedValue({}),
		deleteMany: vi.fn().mockResolvedValue({}),
	} as unknown as AdapterStub;
}

describe("createStateStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-11T10:00:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});
	it("set: inserts when no existing row", async () => {
		const adapter = makeAdapter();
		const store = createStateStore(adapter);
		const value = { fake: "state" } as unknown as NodeSavedState;
		await store.set("key-1", value);
		expect(adapter.create).toHaveBeenCalledWith({
			model: "atprotoState",
			data: expect.objectContaining({
				key: "key-1",
				state: JSON.stringify(value),
				expiresAt: new Date("2026-05-11T10:10:00Z"),
			}),
		});
	});
	it("set: updates when row exists", async () => {
		const adapter = makeAdapter();
		adapter.findOne.mockResolvedValueOnce({ id: "row-1" });
		const store = createStateStore(adapter);
		await store.set("key-1", { x: 1 } as unknown as NodeSavedState);
		expect(adapter.update).toHaveBeenCalled();
		expect(adapter.create).not.toHaveBeenCalled();
	});
	it("get: returns parsed state when not expired", async () => {
		const adapter = makeAdapter();
		adapter.findOne.mockResolvedValueOnce({
			state: JSON.stringify({ y: 2 }),
			expiresAt: new Date("2026-05-11T10:09:00Z"),
		});
		const store = createStateStore(adapter);
		const result = await store.get("key-1");
		expect(result).toEqual({ y: 2 });
	});
	it("get: returns undefined and deletes when expired", async () => {
		const adapter = makeAdapter();
		adapter.findOne.mockResolvedValueOnce({
			state: "{}",
			expiresAt: new Date("2026-05-11T09:00:00Z"),
		});
		const store = createStateStore(adapter);
		const result = await store.get("expired-key");
		expect(result).toBeUndefined();
		expect(adapter.delete).toHaveBeenCalledWith({
			model: "atprotoState",
			where: [{ field: "key", value: "expired-key" }],
		});
	});
	it("get: returns undefined when not found", async () => {
		const adapter = makeAdapter();
		const store = createStateStore(adapter);
		expect(await store.get("missing")).toBeUndefined();
	});
	it("del: deletes the row", async () => {
		const adapter = makeAdapter();
		const store = createStateStore(adapter);
		await store.del("key-1");
		expect(adapter.delete).toHaveBeenCalledWith({
			model: "atprotoState",
			where: [{ field: "key", value: "key-1" }],
		});
	});
	it("set: opportunistic sweep deletes expired rows when random < 0.01", async () => {
		const adapter = makeAdapter();
		vi.spyOn(Math, "random").mockReturnValue(0.005);
		const store = createStateStore(adapter);
		await store.set("key-1", { x: 1 } as unknown as NodeSavedState);
		expect(adapter.deleteMany).toHaveBeenCalledWith({
			model: "atprotoState",
			where: [
				{
					field: "expiresAt",
					operator: "lt",
					value: new Date("2026-05-11T10:00:00Z"),
				},
			],
		});
	});
	it("set: no sweep when random >= 0.01", async () => {
		const adapter = makeAdapter();
		vi.spyOn(Math, "random").mockReturnValue(0.5);
		const store = createStateStore(adapter);
		await store.set("key-1", { x: 1 } as unknown as NodeSavedState);
		expect(adapter.deleteMany).not.toHaveBeenCalled();
	});
});

describe("createSessionStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-05-11T10:00:00Z"));
	});
	afterEach(() => {
		vi.useRealTimers();
	});
	it("set: inserts null userId when no existing row", async () => {
		const adapter = makeAdapter();
		const store = createSessionStore(adapter);
		await store.set("did:plc:abc", {
			tokens: 1,
		} as unknown as NodeSavedSession);
		expect(adapter.create).toHaveBeenCalledWith({
			model: "atprotoSession",
			data: expect.objectContaining({
				did: "did:plc:abc",
				session: JSON.stringify({ tokens: 1 }),
				userId: null,
				updatedAt: expect.any(Date),
			}),
		});
	});
	it("set: updates existing session", async () => {
		const adapter = makeAdapter();
		adapter.findOne.mockResolvedValueOnce({ id: "row-1" });
		const store = createSessionStore(adapter);
		await store.set("did:plc:abc", {
			tokens: 2,
		} as unknown as NodeSavedSession);
		expect(adapter.update).toHaveBeenCalled();
		expect(adapter.create).not.toHaveBeenCalled();
	});
	it("get: returns parsed session", async () => {
		const adapter = makeAdapter();
		adapter.findOne.mockResolvedValueOnce({
			session: JSON.stringify({ tokens: 3 }),
		});
		const store = createSessionStore(adapter);
		expect(await store.get("did:plc:abc")).toEqual({ tokens: 3 });
	});
	it("get: returns undefined when missing", async () => {
		const adapter = makeAdapter();
		const store = createSessionStore(adapter);
		expect(await store.get("did:plc:nope")).toBeUndefined();
	});
	it("del: deletes by did", async () => {
		const adapter = makeAdapter();
		const store = createSessionStore(adapter);
		await store.del("did:plc:abc");
		expect(adapter.delete).toHaveBeenCalledWith({
			model: "atprotoSession",
			where: [{ field: "did", value: "did:plc:abc" }],
		});
	});
});
