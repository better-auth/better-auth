import type { SecondaryStorage } from "./type";

const REDACTED = "[redacted]";
const FALLBACK_MESSAGE = "Secondary storage operation failed";
/**
 * Arguments shorter than this, such as a counter value of `"1"`, are redacted
 * where a string equals them or where they appear quoted in a JSON-encoded
 * command, but not as substrings, so they cannot mangle unrelated text such as
 * an IP address or a stack trace.
 */
const MIN_SUBSTRING_LENGTH = 8;
/** How deep errors are rewritten in place. */
const MAX_REWRITE_DEPTH = 10;
/** How many objects the final check reads before it assumes a secret remains. */
const MAX_SCANNED_OBJECTS = 1000;

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

interface Secrets {
	exact: Set<string>;
	substrings: string[];
}

/**
 * The strings a storage error must not carry: every string argument, as given,
 * as it appears inside a JSON-encoded command, and URL-encoded.
 */
function secretsOf(args: readonly unknown[]): Secrets {
	const exact = new Set<string>();
	const substrings = new Set<string>();
	for (const arg of args) {
		if (typeof arg !== "string" || !arg) continue;
		exact.add(arg);
		if (arg.length < MIN_SUBSTRING_LENGTH) {
			substrings.add(JSON.stringify(arg));
			continue;
		}
		substrings.add(arg);
		substrings.add(JSON.stringify(arg).slice(1, -1));
		try {
			substrings.add(encodeURIComponent(arg));
		} catch {
			// A string with a lone surrogate has no URL encoding to redact.
		}
	}
	return {
		exact,
		// Replace longer secrets first so a key inside a value is not split.
		substrings: [...substrings].sort((a, b) => b.length - a.length),
	};
}

function redactString(value: string, secrets: Secrets): string {
	if (secrets.exact.has(value)) return REDACTED;
	let result = value;
	for (const secret of secrets.substrings) {
		result = result.split(secret).join(REDACTED);
	}
	return result;
}

function stringHasSecret(value: string, secrets: Secrets): boolean {
	return (
		secrets.exact.has(value) ||
		secrets.substrings.some((secret) => value.includes(secret))
	);
}

/**
 * Returns the redacted text of a byte array that holds a secret, such as an
 * ioredis key sent as a Buffer, or the original value when it holds none.
 */
function redactBytes(value: ArrayBufferView, secrets: Secrets) {
	const text = new TextDecoder().decode(value);
	const redacted = redactString(text, secrets);
	return redacted === text ? value : redacted;
}

/** Detects errors from any realm, which `instanceof Error` misses. */
function isErrorLike(value: object): boolean {
	return (
		value instanceof Error ||
		Object.prototype.toString.call(value) === "[object Error]"
	);
}

function isRewritable(value: object): boolean {
	if (Array.isArray(value) || isErrorLike(value)) return true;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function ownKeysOf(value: object): PropertyKey[] {
	const keys = new Set<PropertyKey>(Reflect.ownKeys(value));
	// `message` and `stack` can be inherited or accessors.
	if (isErrorLike(value)) {
		keys.add("message");
		keys.add("stack");
	}
	return [...keys];
}

/**
 * Rewrites secrets in an error's own properties and in the plain objects,
 * arrays, and errors it holds, such as `command` and `cause`. Class instances,
 * maps, and other objects are left untouched, since they may be live client
 * state; the check that follows decides whether they still hold a secret.
 */
function rewriteInPlace(
	target: object,
	secrets: Secrets,
	seen: WeakSet<object>,
	depth: number,
): void {
	if (depth > MAX_REWRITE_DEPTH || seen.has(target) || !isRewritable(target)) {
		return;
	}
	seen.add(target);
	const errorLike = isErrorLike(target);
	for (const key of ownKeysOf(target)) {
		const descriptor = Object.getOwnPropertyDescriptor(target, key);
		const isAccessor = descriptor && !("value" in descriptor);
		if (isAccessor && !(errorLike && (key === "message" || key === "stack"))) {
			continue;
		}
		const current: unknown = Reflect.get(target, key);
		let redacted: unknown = current;
		if (typeof current === "string") {
			redacted = redactString(current, secrets);
		} else if (ArrayBuffer.isView(current)) {
			redacted = redactBytes(current, secrets);
		} else if (current !== null && typeof current === "object") {
			rewriteInPlace(current, secrets, seen, depth + 1);
		}
		if (redacted !== current) Reflect.set(target, key, redacted);
	}
}

/**
 * Reports whether a value still exposes a secret to `util.inspect`,
 * `JSON.stringify`, or an error serializer. It reads own properties, symbol
 * keys, getters, map and set entries, and `toJSON` results, and reports a
 * secret when the value is too large to check.
 */
function hasSecret(value: unknown, secrets: Secrets): boolean {
	const seen = new WeakSet<object>();
	const pending: unknown[] = [value];
	let scanned = 0;
	const read = (read: () => unknown) => {
		try {
			pending.push(read());
		} catch {
			// A throwing getter exposes nothing.
		}
	};
	while (pending.length) {
		const current = pending.pop();
		if (typeof current === "string") {
			if (stringHasSecret(current, secrets)) return true;
			continue;
		}
		if (ArrayBuffer.isView(current)) {
			if (redactBytes(current, secrets) !== current) return true;
			continue;
		}
		if (
			current === null ||
			(typeof current !== "object" && typeof current !== "function") ||
			seen.has(current)
		) {
			continue;
		}
		seen.add(current);
		if (++scanned > MAX_SCANNED_OBJECTS) return true;
		if (current instanceof Map) {
			for (const [key, entry] of current) pending.push(key, entry);
		} else if (current instanceof Set) {
			for (const entry of current) pending.push(entry);
		}
		for (const key of ownKeysOf(current)) {
			// Keys such as array indexes are short, so only longer secrets count.
			const keyText = String(key);
			if (
				keyText.length >= MIN_SUBSTRING_LENGTH &&
				stringHasSecret(keyText, secrets)
			) {
				return true;
			}
			read(() => Reflect.get(current, key));
		}
		const toJSON: unknown = Reflect.get(current, "toJSON");
		if (typeof toJSON === "function")
			read(() => Reflect.apply(toJSON, current, []));
	}
	return false;
}

function readString(value: object, key: string): string | undefined {
	try {
		const result: unknown = Reflect.get(value, key);
		return typeof result === "string" ? result : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Builds an error that keeps the diagnostics of one that still exposes a
 * secret: its redacted message, name, and stack, its primitive properties such
 * as `code`, its command name, and its cause.
 */
function replacementFor(error: object, secrets: Secrets, depth: number): Error {
	const replacement = new Error(
		redactString(readString(error, "message") ?? "", secrets),
	);
	const name = readString(error, "name");
	if (name) replacement.name = redactString(name, secrets);
	const stack = readString(error, "stack");
	if (stack) replacement.stack = redactString(stack, secrets);
	for (const key of Object.keys(error)) {
		if (["message", "name", "stack", "cause", "command"].includes(key)) {
			continue;
		}
		const descriptor = Object.getOwnPropertyDescriptor(error, key);
		const value: unknown = descriptor?.value;
		if (typeof value === "string") {
			Reflect.set(replacement, key, redactString(value, secrets));
		} else if (["number", "boolean", "bigint"].includes(typeof value)) {
			Reflect.set(replacement, key, value);
		}
	}
	const command = Object.getOwnPropertyDescriptor(error, "command")?.value;
	if (command !== null && typeof command === "object") {
		const commandName = readString(command, "name");
		if (commandName) {
			Reflect.set(replacement, "command", {
				name: redactString(commandName, secrets),
			});
		}
	}
	const cause = Object.getOwnPropertyDescriptor(error, "cause")?.value;
	if (typeof cause === "string") {
		replacement.cause = redactString(cause, secrets);
	} else if (cause !== null && typeof cause === "object") {
		if (!hasSecret(cause, secrets)) {
			replacement.cause = cause;
		} else if (depth < MAX_REWRITE_DEPTH) {
			replacement.cause = replacementFor(cause, secrets, depth + 1);
		}
	}
	return replacement;
}

function fallbackFor(error: unknown, secrets: Secrets): Error {
	const fallback = new Error(FALLBACK_MESSAGE);
	if (error !== null && typeof error === "object") {
		const name = readString(error, "name");
		if (name) fallback.name = redactString(name, secrets);
	}
	return fallback;
}

function redactStorageError(error: unknown, args: readonly unknown[]): unknown {
	const secrets = secretsOf(args);
	if (!secrets.exact.size) return error;
	try {
		if (typeof error === "string") return redactString(error, secrets);
		if (error === null || typeof error !== "object") return error;
		rewriteInPlace(error, secrets, new WeakSet(), 0);
		if (!hasSecret(error, secrets)) return error;
		const replacement = replacementFor(error, secrets, 0);
		return hasSecret(replacement, secrets)
			? fallbackFor(error, secrets)
			: replacement;
	} catch {
		// Redaction must not replace the storage failure with its own.
		return fallbackFor(error, secrets);
	}
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		value !== null &&
		(typeof value === "object" || typeof value === "function") &&
		typeof Reflect.get(value, "then") === "function"
	);
}

/** Whether a proxy over `storage` may return values other than its own. */
function canProxyDirectly(storage: object): boolean {
	if (!Object.isExtensible(storage)) return false;
	return Object.values(Object.getOwnPropertyDescriptors(storage)).every(
		(descriptor) => descriptor.configurable || descriptor.writable,
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
 * fails. The error keeps its identity, name, and the rest of its message and
 * properties, except text that equals or contains an argument. When a secret
 * remains somewhere it cannot be rewritten, such as a class instance or a
 * frozen object, the error is replaced with one that keeps its redacted
 * message, name, stack, primitive properties, command name, and cause.
 *
 * The wrapper is a proxy over the storage, so other properties, spies, and
 * property definitions behave as they do on the storage. Results, including
 * synchronous ones, are unchanged.
 */
export function redactSecondaryStorageErrors<T extends SecondaryStorage>(
	storage: T,
): T {
	if (redactedStorages.has(storage)) return storage;
	const existing = proxies.get(storage);
	if (existing) return existing as T;
	const redacting = new WeakMap<object, unknown>();
	const forwarding = new WeakMap<object, unknown>();
	// A proxy must return a frozen property's own value, so a frozen storage is
	// proxied through an unlocked copy of it.
	const target: T = canProxyDirectly(storage)
		? storage
		: Object.create(
				Object.getPrototypeOf(storage),
				Object.fromEntries(
					Reflect.ownKeys(storage).map((key) => [
						key,
						{
							...Object.getOwnPropertyDescriptor(storage, key),
							configurable: true,
						},
					]),
				),
			);
	const proxy: T = new Proxy(target, {
		get(_, property) {
			const value: unknown = Reflect.get(storage, property);
			if (typeof value !== "function" || property === "constructor") {
				return value;
			}
			const own = Reflect.getOwnPropertyDescriptor(target, property);
			if (own && !own.configurable && !own.writable) return value;
			if (typeof property === "string" && STORAGE_METHODS.has(property)) {
				let method = redacting.get(value);
				if (!method) {
					const call = (...args: unknown[]) => {
						let result: unknown;
						try {
							result = Reflect.apply(value, storage, args);
						} catch (error) {
							throw redactStorageError(error, args);
						}
						if (!isPromiseLike(result)) return result;
						return Promise.resolve(result).catch((error: unknown) => {
							throw redactStorageError(error, args);
						});
					};
					// Keeps properties of the original, such as a mock's call record.
					Object.setPrototypeOf(call, value);
					method = call;
					redacting.set(value, method);
				}
				return method;
			}
			let method = forwarding.get(value);
			if (!method) {
				// Other functions keep their properties and constructor, and run
				// against the storage, which may keep private state keyed on it.
				method = new Proxy(value, {
					apply: (fn, thisArg, args) =>
						Reflect.apply(fn, thisArg === proxy ? storage : thisArg, args),
				});
				forwarding.set(value, method);
			}
			return method;
		},
		set: (_, property, value) => Reflect.set(storage, property, value),
		defineProperty: (_, property, descriptor) =>
			Reflect.defineProperty(storage, property, descriptor) &&
			(target === storage ||
				Reflect.defineProperty(target, property, {
					...descriptor,
					configurable: true,
				})),
		deleteProperty: (_, property) =>
			Reflect.deleteProperty(storage, property) &&
			(target === storage || Reflect.deleteProperty(target, property)),
	});
	redactedStorages.add(proxy);
	proxies.set(storage, proxy);
	return proxy;
}
