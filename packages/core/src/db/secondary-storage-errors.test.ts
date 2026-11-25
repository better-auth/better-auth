import { inspect } from "node:util";
import { runInNewContext } from "node:vm";
import { describe, expect, it, onTestFinished, vi } from "vitest";
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
		for (let i = 0; i < 20; i++) {
			nested = Object.assign(new Error("wrapped"), { cause: nested });
		}
		const outer = nested;
		const storage = redactSecondaryStorageErrors(
			storageThatRejects(() => outer),
		);

		const error = await rejection(storage.get(TOKEN));

		expect(error).not.toBe(outer);
		expect((error as Error).message).toBe("wrapped");
		expect(inspect(error, { depth: 40 })).not.toContain(TOKEN);
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

	describe("errors it cannot rewrite in place", () => {
		const leaks = (error: unknown) =>
			inspect(error, { depth: 20, getters: true }).includes(TOKEN) ||
			(JSON.stringify(error) ?? "").includes(TOKEN);

		it.each([
			[
				"a class instance",
				() =>
					Object.assign(new Error("ERR"), {
						command: Object.assign(Object.create({ describe() {} }), {
							name: "get",
							args: [TOKEN],
						}),
					}),
			],
			[
				"a Map",
				() =>
					Object.assign(new Error("ERR"), { meta: new Map([["key", TOKEN]]) }),
			],
			[
				"a symbol key",
				() =>
					Object.assign(new Error("ERR"), {
						[Symbol("command")]: { args: [TOKEN] },
					}),
			],
			[
				"an enumerable getter",
				() =>
					Object.defineProperty(new Error("ERR"), "command", {
						enumerable: true,
						get: () => ({ name: "get", args: [TOKEN] }),
					}),
			],
			[
				"an error from another realm",
				() =>
					runInNewContext("new Error('GET ' + token + ' failed')", {
						token: TOKEN,
					}) as unknown,
			],
		])("does not pass through a secret held in %s", async (_, create) => {
			const storage = redactSecondaryStorageErrors(storageThatRejects(create));

			const error = await rejection(storage.get(TOKEN));

			expect(leaks(error)).toBe(false);
		});

		it("keeps diagnostics on the replacement error", async () => {
			const original = Object.freeze(
				Object.assign(new Error(`connect failed for ${TOKEN}`), {
					name: "ReplyError",
					code: "ECONNRESET",
					errno: -104,
					command: { name: "get", args: [TOKEN] },
					cause: new Error("socket closed"),
				}),
			);
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(error).not.toBe(original);
			expect(error).toMatchObject({
				name: "ReplyError",
				message: "connect failed for [redacted]",
				code: "ECONNRESET",
				errno: -104,
				command: { name: "get" },
				cause: original.cause,
			});
			expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
		});

		it("redacts the name of the replacement error", async () => {
			const original = Object.freeze(
				Object.assign(new Error("ERR"), { name: `Error for ${TOKEN}` }),
			);
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect((error as Error).name).toBe("Error for [redacted]");
		});

		it("keeps an error whose only deep nesting holds no secret", async () => {
			let details: Record<string, unknown> = { reason: "validation failed" };
			for (let i = 0; i < 20; i++) details = { details };
			const original = Object.assign(new Error(`failed for ${TOKEN}`), {
				code: "EVALIDATION",
				response: details,
			});
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(error).toBe(original);
			expect(original.message).toBe("failed for [redacted]");
		});

		it("keeps the message when rewriting a property throws", async () => {
			const original = new Error("ERR");
			Object.defineProperty(original, "message", {
				get: () => `failed for ${TOKEN}`,
				set: () => {
					throw new Error("setter failed");
				},
			});
			Object.freeze(original);
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect((error as Error).message).toBe("failed for [redacted]");
			expect(inspect(error)).not.toContain(TOKEN);
		});

		it("falls back to a generic error when redaction itself throws", async () => {
			const decode = vi
				.spyOn(TextDecoder.prototype, "decode")
				.mockImplementation(() => {
					throw new Error("decoder failed");
				});
			onTestFinished(() => decode.mockRestore());
			const original = Object.assign(new Error(`failed for ${TOKEN}`), {
				name: "ReplyError",
				command: { args: [new Uint8Array([1])] },
			});
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(error).toMatchObject({
				name: "ReplyError",
				message: "Secondary storage operation failed",
			});
		});

		it.each([
			[
				"a throwing toJSON getter",
				() => ({
					get toJSON() {
						throw new Error("nope");
					},
				}),
			],
			[
				"a revoked proxy",
				() => {
					const { proxy, revoke } = Proxy.revocable({}, {});
					revoke();
					return proxy;
				},
			],
		])(
			"keeps the message and code when a property holds %s",
			async (_, extra) => {
				const original = Object.assign(new Error("READONLY You can't write"), {
					code: "READONLY",
					extra: extra(),
				});
				const storage = redactSecondaryStorageErrors(
					storageThatRejects(() => original),
				);

				const error = await rejection(storage.get(TOKEN));

				expect(error).toMatchObject({
					message: "READONLY You can't write",
					code: "READONLY",
				});
			},
		);

		it("does not run getters or toJSON on objects it checks", async () => {
			const calls = { getter: 0, toJSON: 0 };
			const client = Object.create({
				toJSON() {
					calls.toJSON++;
					return {};
				},
			});
			Object.defineProperty(client, "connection", {
				get() {
					calls.getter++;
					return {};
				},
			});
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() =>
					Object.assign(new Error(`failed for ${TOKEN}`), { client }),
				),
			);

			await rejection(storage.get(TOKEN));

			expect(calls).toEqual({ getter: 0, toJSON: 0 });
		});

		it("does not pass through a secret printed by a custom inspect hook", async () => {
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() =>
					Object.assign(new Error("ERR"), {
						details: {
							[Symbol.for("nodejs.util.inspect.custom")]: () => TOKEN,
						},
					}),
				),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
			expect((error as Error).message).toBe("ERR");
		});

		it("bounds the check by the number of entries, not only objects", async () => {
			const cache = new Map<string, string>();
			for (let i = 0; i < 50_000; i++) cache.set(`key-${i}`, `value-${i}`);
			const original = Object.assign(new Error("ERR"), {
				code: "EBUSY",
				client: { cache },
			});
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(error).not.toBe(original);
			expect(error).toMatchObject({ message: "ERR", code: "EBUSY" });
		});

		it("replaces a frozen error that has no string message", async () => {
			const original = Object.freeze(
				Object.assign(new Error(), {
					message: undefined,
					command: Object.freeze({ args: Object.freeze([TOKEN]) }),
				}),
			);
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.get(TOKEN));

			expect(error).toBeInstanceOf(Error);
			expect(error).not.toBeInstanceOf(TypeError);
			expect(inspect(error, { depth: 10 })).not.toContain(TOKEN);
		});
	});

	describe("short arguments", () => {
		it("leaves unrelated text alone while redacting a short value", async () => {
			const original = Object.assign(
				new Error("connect ECONNREFUSED 127.0.0.1:6379"),
				{ address: "127.0.0.1", command: { name: "set", args: ["k", "1"] } },
			);
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(() => original),
			);

			const error = await rejection(storage.set("k", "1"));

			expect(error).toMatchObject({
				message: "connect ECONNREFUSED 127.0.0.1:6379",
				address: "127.0.0.1",
				command: { args: ["[redacted]", "[redacted]"] },
			});
		});

		it("redacts a short key in its URL-encoded form", async () => {
			const storage = redactSecondaryStorageErrors(
				storageThatRejects((args) =>
					Object.assign(new Error("ERR"), {
						path: encodeURIComponent(String(args[0])),
					}),
				),
			);

			const error = await rejection(storage.get("a b/c"));

			expect(error).toMatchObject({ path: "[redacted]" });
		});

		it("redacts a short value quoted inside a JSON-encoded command", async () => {
			const storage = redactSecondaryStorageErrors(
				storageThatRejects(
					(args) =>
						new Error(
							`ERR limit, command was: ${JSON.stringify(["set", ...args])}`,
						),
				),
			);

			const error = await rejection(
				storage.set("otp:user@example.com", "123456"),
			);

			expect((error as Error).message).toBe(
				'ERR limit, command was: ["set","[redacted]",[redacted]]',
			);
		});
	});

	describe("the wrapped storage", () => {
		it("redacts a method read through its property descriptor", async () => {
			const wrapped = redactSecondaryStorageErrors(
				storageThatRejects((args) => ioredisReplyError("get", [args[0]])),
			);
			const get = Object.getOwnPropertyDescriptor(wrapped, "get")?.value as (
				key: string,
			) => Promise<unknown>;

			const error = await rejection(get(TOKEN));

			expect(error).toMatchObject({ command: { args: ["[redacted]"] } });
		});

		it("keeps redacting when the storage is locked after it was wrapped", async () => {
			const storage = storageThatRejects((args) =>
				ioredisReplyError("get", [args[0]]),
			);
			const wrapped = redactSecondaryStorageErrors(storage);
			Object.freeze(storage);

			const error = await rejection(wrapped.get(TOKEN));

			expect(error).toMatchObject({ command: { args: ["[redacted]"] } });
		});

		it("refuses to freeze its storage methods", async () => {
			const wrapped = redactSecondaryStorageErrors(
				storageThatRejects((args) => ioredisReplyError("get", [args[0]])),
			);

			expect(() => Object.freeze(wrapped)).toThrow(TypeError);
			const error = await rejection(wrapped.get(TOKEN));
			expect(error).toMatchObject({ command: { args: ["[redacted]"] } });
		});

		it("restores the original method when a spy is removed", () => {
			const storage = storageThatRejects(() => null);
			const original = storage.get;
			const wrapped: SecondaryStorage = redactSecondaryStorageErrors(storage);

			vi.spyOn(wrapped, "get").mockRestore();

			expect(storage.get).toBe(original);
		});

		it("honors a spy installed on it", async () => {
			const wrapped: SecondaryStorage = redactSecondaryStorageErrors(
				storageThatRejects(() => null),
			);
			const spy = vi.spyOn(wrapped, "get").mockResolvedValue("mocked");

			expect(await wrapped.get("k")).toBe("mocked");
			expect(spy).toHaveBeenCalledWith("k");
		});

		it("exposes the mock state of a mocked storage method", async () => {
			const storage = {
				...storageThatRejects(() => null),
				get: vi.fn((_key: string) => "v"),
			};
			const wrapped = redactSecondaryStorageErrors(storage);

			wrapped.get("k");

			expect(wrapped.get).toHaveBeenCalledWith("k");
		});

		it("accepts property definitions", () => {
			const wrapped = redactSecondaryStorageErrors(
				storageThatRejects(() => null),
			);

			Object.defineProperty(wrapped, "extra", { value: 1 });

			expect(Reflect.get(wrapped, "extra")).toBe(1);
		});

		it("keeps function properties that are not storage methods usable", () => {
			const end = () => "ended";
			const sql = Object.assign(() => "query", { end });
			const Client = function (this: { ok: boolean }) {
				this.ok = true;
			};
			const wrapped = redactSecondaryStorageErrors({
				...storageThatRejects(() => null),
				sql,
				Client,
			});

			expect(wrapped.sql.end).toBe(end);
			expect(Reflect.construct(wrapped.Client, [])).toEqual({ ok: true });
		});

		it("shows the storage when inspected", () => {
			const wrapped = redactSecondaryStorageErrors({
				...storageThatRejects(() => null),
				client: "redis",
			});

			expect(inspect(wrapped)).toContain("client: 'redis'");
		});
	});
});
