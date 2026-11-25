import type { SecondaryStorage } from "./type";

const REDACTED = "[redacted]";
const MAX_DEPTH = 5;

type StorageMethod = Exclude<keyof SecondaryStorage, symbol>;

const STORAGE_METHODS = new Set<string>([
	"get",
	"getAndDelete",
	"increment",
	"set",
	"delete",
] satisfies StorageMethod[]);

const redactedStorages = new WeakSet<object>();
const proxies = new WeakMap<object, object>();

/**
 * The strings a storage error must not carry: every string argument, as given,
 * as it appears inside a JSON-encoded command, and URL-encoded.
 */
function secretsOf(args: readonly unknown[]): string[] {
	const secrets = new Set<string>();
	for (const arg of args) {
		if (typeof arg !== "string" || !arg) continue;
		secrets.add(arg);
		secrets.add(JSON.stringify(arg).slice(1, -1));
		secrets.add(encodeURIComponent(arg));
	}
	// Replace longer secrets first so a key inside a value is not split.
	return [...secrets].sort((a, b) => b.length - a.length);
}

function redactString(value: string, secrets: readonly string[]): string {
	let result = value;
	for (const secret of secrets) {
		result = result.split(secret).join(REDACTED);
	}
	return result;
}

/**
 * Returns the redacted text of a byte array that holds a secret, such as an
 * ioredis key sent as a Buffer, or the original value when it holds none.
 */
function redactBytes(value: ArrayBufferView, secrets: readonly string[]) {
	const text = new TextDecoder().decode(value);
	const redacted = redactString(text, secrets);
	return redacted === text ? value : redacted;
}

function isTraversable(value: object): boolean {
	if (value instanceof Error || Array.isArray(value)) return true;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Redacts secrets from an error, its own properties, and nested plain objects,
 * arrays, and errors (such as `cause`). Returns `false` when a property that
 * holds a secret cannot be rewritten, or the error nests too deeply to check.
 */
function redactInPlace(
	target: object,
	secrets: readonly string[],
	seen: WeakSet<object>,
	depth: number,
): boolean {
	if (seen.has(target) || !isTraversable(target)) return true;
	if (depth > MAX_DEPTH) return false;
	seen.add(target);
	let complete = true;
	const names = new Set(Object.getOwnPropertyNames(target));
	// `message` and `stack` can be accessors, which other properties may not be.
	if (target instanceof Error) {
		names.add("message");
		names.add("stack");
	}
	for (const name of names) {
		const descriptor = Object.getOwnPropertyDescriptor(target, name);
		if (
			descriptor &&
			!("value" in descriptor) &&
			name !== "message" &&
			name !== "stack"
		) {
			continue;
		}
		const current: unknown = Reflect.get(target, name);
		let redacted: unknown = current;
		if (typeof current === "string") {
			redacted = redactString(current, secrets);
		} else if (ArrayBuffer.isView(current)) {
			redacted = redactBytes(current, secrets);
		} else if (current !== null && typeof current === "object") {
			complete = redactInPlace(current, secrets, seen, depth + 1) && complete;
		}
		if (redacted !== current && !Reflect.set(target, name, redacted)) {
			complete = false;
		}
	}
	return complete;
}

function redactStorageError(error: unknown, args: readonly unknown[]): unknown {
	const secrets = secretsOf(args);
	if (!secrets.length) return error;
	if (typeof error === "string") return redactString(error, secrets);
	if (error === null || typeof error !== "object") return error;
	if (redactInPlace(error, secrets, new WeakSet(), 0)) return error;
	// The error could not be fully rewritten (for example, it is frozen), so
	// replace it.
	const message =
		error instanceof Error ? redactString(error.message, secrets) : "";
	const replacement = new Error(message);
	if (error instanceof Error) replacement.name = error.name;
	return replacement;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === "object" || typeof value === "function") &&
		typeof Reflect.get(value, "then") === "function"
	);
}

/**
 * Wraps a secondary storage so the errors it throws never carry the keys or
 * values it was called with.
 *
 * Keys include session tokens, and values hold cached sessions. Redis clients
 * attach them to errors: ioredis sets `error.command.args`, and Upstash writes
 * the whole command into `error.message`. Those errors reach the logger, user
 * error hooks, and server callers, so they are redacted where the storage call
 * fails. Error identity, name, the rest of the message, and the command name
 * are kept for diagnosis. Results, including synchronous ones, are unchanged.
 */
export function redactSecondaryStorageErrors<T extends SecondaryStorage>(
	storage: T,
): T {
	if (redactedStorages.has(storage)) return storage;
	const existing = proxies.get(storage);
	if (existing) return existing as T;
	const wrapped = new WeakMap<object, unknown>();
	const proxy = new Proxy(storage, {
		get(target, property, receiver) {
			const value: unknown = Reflect.get(target, property, receiver);
			if (typeof value !== "function") return value;
			const cached = wrapped.get(value);
			if (cached) return cached;
			let method: unknown;
			if (typeof property === "string" && STORAGE_METHODS.has(property)) {
				method = (...args: unknown[]) => {
					let result: unknown;
					try {
						result = Reflect.apply(value, target, args);
					} catch (error) {
						throw redactStorageError(error, args);
					}
					if (!isPromiseLike(result)) return result;
					return Promise.resolve(result).catch((error: unknown) => {
						throw redactStorageError(error, args);
					});
				};
			} else {
				// Other methods run against the storage itself, which may keep
				// private state keyed on its own identity.
				method = (...args: unknown[]) => Reflect.apply(value, target, args);
			}
			wrapped.set(value, method);
			return method;
		},
	});
	redactedStorages.add(proxy);
	proxies.set(storage, proxy);
	return proxy;
}
