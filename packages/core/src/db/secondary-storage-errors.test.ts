import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { redactSecondaryStorageErrors } from "./secondary-storage-errors";
import type { SecondaryStorage } from "./type";

const TOKEN = "secret-session-token";

function storageThatRejects(error: (args: unknown[]) => unknown) {
	const reject = async (...args: unknown[]) => {
		throw error(args);
	};
	return {
		get: reject,
		getAndDelete: reject,
		increment: reject,
		set: reject,
		delete: reject,
	} satisfies SecondaryStorage;
}

/**
 * ioredis attaches the failed command, including its key, to reply errors.
 * @see https://github.com/redis/ioredis/blob/v5.11.1/lib/DataHandler.ts
 */
function ioredisReplyError(name: string, args: unknown[]) {
	return Object.assign(
		new Error("READONLY You can't write against a read only replica."),
		{
			name: "ReplyError",
			command: { name, args },
		},
	);
}

async function rejection(promise: unknown) {
	return Promise.resolve(promise).catch((error: unknown) => error);
}

describe("redactSecondaryStorageErrors", () => {
	it.each([
		["get", (s: SecondaryStorage) => s.get(TOKEN)],
		["getAndDelete", (s: SecondaryStorage) => s.getAndDelete(TOKEN)],
		["increment", (s: SecondaryStorage) => s.increment(TOKEN, 60)],
		["set", (s: SecondaryStorage) => s.set(TOKEN, `{"token":"${TOKEN}"}`, 60)],
		["delete", (s: SecondaryStorage) => s.delete(TOKEN)],
	] as const)(
		"removes the key from a rejected %s call and keeps the command name",
		async (command, call) => {
			const storage = redactSecondaryStorageErrors(
				storageThatRejects((args) =>
					ioredisReplyError(command, [
						"better-auth:" + args[0],
						...args.slice(1),
					]),
				),
			);

			const error = await rejection(call(storage));

			expect(error).toMatchObject({
				name: "ReplyError",
				message: "READONLY You can't write against a read only replica.",
				command: { name: command },
			});
			expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
		},
	);

	it("rethrows the same error with the key removed from nested causes", async () => {
		const original = Object.assign(new Error("connection lost"), {
			cause: ioredisReplyError("get", ["better-auth:" + TOKEN]),
		});
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(() => original),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).toBe(original);
		expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
		expect(original.cause.command).toEqual({
			name: "get",
			args: ["better-auth:[redacted]"],
		});
	});

	/**
	 * ioredis sends keys as Buffers when its `keyPrefix` option is a Buffer.
	 * @see https://github.com/redis/ioredis/blob/v5.11.1/lib/Command.ts
	 */
	it("removes a key carried as bytes", async () => {
		const storage = redactSecondaryStorageErrors(
			storageThatRejects((args) =>
				ioredisReplyError("get", [
					new TextEncoder().encode("prefix:" + String(args[0])),
				]),
			),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).toMatchObject({ command: { args: ["prefix:[redacted]"] } });
	});

	it("removes a URL-encoded key from the message", async () => {
		const key = "verification:user@example.com";
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(
				(args) =>
					new Error(`GET /get/${encodeURIComponent(String(args[0]))} failed`),
			),
		);

		const error = await rejection(storage.get(key));

		expect((error as Error).message).toBe("GET /get/[redacted] failed");
	});

	it("replaces an error nested deeper than it inspects", async () => {
		let nested: Error = ioredisReplyError("get", [TOKEN]);
		for (let i = 0; i < 10; i++) {
			nested = Object.assign(new Error("wrapped"), { cause: nested });
		}
		const outer = nested;
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(() => outer),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).not.toBe(outer);
		expect((error as Error).message).toBe("wrapped");
		expect(inspect(error, { depth: 20 })).not.toContain(TOKEN);
	});

	it("replaces an error it cannot rewrite", async () => {
		const frozen = Object.freeze(
			Object.assign(new Error(`ERR command was: ${TOKEN}`), {
				name: "FrozenError",
			}),
		);
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(() => frozen),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).toBeInstanceOf(Error);
		expect(error).not.toBe(frozen);
		expect((error as Error).name).toBe("FrozenError");
		expect((error as Error).message).toBe("ERR command was: [redacted]");
		expect(inspect(error)).not.toContain(TOKEN);
	});

	it("redacts an error thrown synchronously", () => {
		const storage = redactSecondaryStorageErrors({
			...storageThatRejects(() => null),
			get(key) {
				throw ioredisReplyError("get", [key]);
			},
		});

		expect(() => storage.get(TOKEN)).toThrow(
			expect.objectContaining({
				command: { name: "get", args: ["[redacted]"] },
			}),
		);
	});

	it("keeps synchronous results synchronous", () => {
		const storage: SecondaryStorage = redactSecondaryStorageErrors({
			...storageThatRejects(() => null),
			get: () => "cached",
		});

		expect(storage.get("key")).toBe("cached");
	});

	it("keeps the storage's own methods, properties, and `this`", async () => {
		const store = new Map<string, string>([["a", "1"]]);
		const privateState = new WeakMap<object, Map<string, string>>();
		const storage = {
			store,
			get(key: string) {
				return this.store.get(key) ?? null;
			},
			getAndDelete(key: string) {
				return this.store.get(key) ?? null;
			},
			increment() {
				return 1;
			},
			set(key: string, value: string) {
				this.store.set(key, value);
			},
			delete(key: string) {
				this.store.delete(key);
			},
			listKeys() {
				const state = privateState.get(this);
				if (!state) throw new TypeError("called on another object");
				return [...state.keys()];
			},
		};
		privateState.set(storage, store);
		const wrapped = redactSecondaryStorageErrors(storage) as typeof storage;

		await wrapped.set("b", "2");

		expect(await wrapped.get("a")).toBe("1");
		expect(wrapped.listKeys()).toEqual(["a", "b"]);
		expect(wrapped.store).toBe(store);
	});

	it("redacts a storage method that shares its function with another property", async () => {
		const remove = async (key: string) => {
			throw ioredisReplyError("del", [key]);
		};
		const storage = {
			...storageThatRejects(() => null),
			del: remove,
			delete: remove,
		};
		const wrapped = redactSecondaryStorageErrors(storage);

		void wrapped.del;
		const error = await rejection(wrapped.delete(TOKEN));

		expect(error).toMatchObject({
			command: { name: "del", args: ["[redacted]"] },
		});
	});

	it("keeps properties that are not storage methods, such as `constructor`", () => {
		const storage = storageThatRejects(() => null);
		const wrapped = redactSecondaryStorageErrors(storage);

		expect(wrapped.constructor).toBe(Object);
		expect({ ...wrapped }).toHaveProperty("get");
		expect(Object.keys(wrapped)).toEqual(Object.keys(storage));
	});

	it("redacts errors from a frozen storage", async () => {
		const storage = redactSecondaryStorageErrors(
			Object.freeze(
				storageThatRejects((args) => ioredisReplyError("get", [args[0]])),
			),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).toMatchObject({
			command: { name: "get", args: ["[redacted]"] },
		});
	});

	it("keeps the storage error when a key is not valid UTF-16", async () => {
		const key = `\uD800${TOKEN}`;
		const storage = redactSecondaryStorageErrors(
			storageThatRejects((args) => ioredisReplyError("get", [args[0]])),
		);

		const error = await rejection(storage.get(key));

		expect(error).toMatchObject({
			name: "ReplyError",
			command: { name: "get", args: ["[redacted]"] },
		});
	});

	it("wraps a storage only once", () => {
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(() => null),
		);

		expect(redactSecondaryStorageErrors(storage)).toBe(storage);
	});

	it("returns the same wrapper for the same storage", () => {
		const storage = storageThatRejects(() => null);

		expect(redactSecondaryStorageErrors(storage)).toBe(
			redactSecondaryStorageErrors(storage),
		);
	});
});
