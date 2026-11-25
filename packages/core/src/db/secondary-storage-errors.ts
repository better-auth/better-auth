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
/** How many values the final check reads before it assumes a secret remains. */
const MAX_SCANNED_VALUES = 10_000;
/** How much text the final check reads before it assumes a secret remains. */
const MAX_SCANNED_CHARACTERS = 1_000_000;
const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

type StorageMethod = Exclude<keyof SecondaryStorage, symbol>;

const STORAGE_METHODS = new Set<PropertyKey>([
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

function urlEncoded(value: string): string | undefined {
	try {
		return encodeURIComponent(value);
	} catch {
		// A string with a lone surrogate has no URL encoding.
		return undefined;
	}
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
		const encoded = urlEncoded(arg);
		const forms = encoded ? [arg, encoded] : [arg];
		for (const form of forms) {
			exact.add(form);
			if (form.length < MIN_SUBSTRING_LENGTH) {
				substrings.add(JSON.stringify(form));
			} else {
				substrings.add(form);
				substrings.add(JSON.stringify(form).slice(1, -1));
			}
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

function tagOf(value: object): string {
	return Object.prototype.toString.call(value);
}

/** Detects errors from any realm, which `instanceof Error` misses. */
function isErrorLike(value: object): boolean {
	return value instanceof Error || tagOf(value) === "[object Error]";
}

function isPlain(value: object): boolean {
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

function isErrorText(value: object, key: PropertyKey): boolean {
	return (key === "message" || key === "stack") && isErrorLike(value);
}

/**
 * Finds a property on an object or its prototypes without running getters.
 * Returns `"accessor"` for a getter, since its value cannot be known safely.
 */
function lookup(value: object, key: PropertyKey): unknown {
	for (
		let current: object | null = value;
		current;
		current = Object.getPrototypeOf(current)
	) {
		const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
		if (descriptor)
			return "value" in descriptor ? descriptor.value : "accessor";
	}
	return undefined;
}

/**
 * Whether serializing a value runs code the check does not run: a custom
 * `util.inspect` hook, or any `toJSON` other than the one dates use.
 */
function runsCodeWhenPrinted(value: object): boolean {
	if (lookup(value, INSPECT_CUSTOM) !== undefined) return true;
	const toJSON = lookup(value, "toJSON");
	return toJSON !== undefined && toJSON !== Date.prototype.toJSON;
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
	if (depth > MAX_REWRITE_DEPTH || seen.has(target)) return;
	seen.add(target);
	try {
		if (!isPlain(target)) return;
		if (Array.isArray(target) && target.length > MAX_SCANNED_VALUES) return;
		for (const key of ownKeysOf(target)) {
			const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
			if (descriptor && !("value" in descriptor) && !isErrorText(target, key)) {
				continue;
			}
			try {
				const current: unknown = descriptor?.value ?? Reflect.get(target, key);
				let redacted: unknown = current;
				if (typeof current === "string") {
					redacted = redactString(current, secrets);
				} else if (ArrayBuffer.isView(current)) {
					redacted = redactBytes(current, secrets);
				} else if (current !== null && typeof current === "object") {
					rewriteInPlace(current, secrets, seen, depth + 1);
				}
				if (redacted !== current) Reflect.set(target, key, redacted);
			} catch {
				// The check that follows reports what could not be rewritten.
			}
		}
	} catch {
		// An object that cannot be read, such as a revoked proxy, is left to the check.
	}
}

/**
 * Reports whether a value may still expose a secret to `util.inspect`,
 * `JSON.stringify`, or an error serializer. It reads own data properties,
 * symbol keys, and map and set entries without running getters, and it reports
 * a possible secret for what it cannot read: enumerable getters, custom
 * serialization hooks, objects that throw when read, and values beyond its
 * size bounds.
 */
function hasSecret(value: unknown, secrets: Secrets): boolean {
	const seen = new WeakSet<object>();
	const pending: unknown[] = [value];
	let values = 0;
	let characters = 0;
	const enqueue = (entry: unknown) => {
		pending.push(entry);
		return ++values <= MAX_SCANNED_VALUES;
	};
	while (pending.length) {
		const current = pending.pop();
		if (typeof current === "string") {
			characters += current.length;
			if (characters > MAX_SCANNED_CHARACTERS) return true;
			if (stringHasSecret(current, secrets)) return true;
			continue;
		}
		if (ArrayBuffer.isView(current)) {
			characters += current.byteLength;
			if (characters > MAX_SCANNED_CHARACTERS) return true;
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
		try {
			if (runsCodeWhenPrinted(current)) return true;
			const tag = tagOf(current);
			const collection =
				tag === "[object Map]"
					? Map.prototype
					: tag === "[object Set]"
						? Set.prototype
						: undefined;
			if (collection) {
				// The built-in methods also read maps and sets from other realms.
				const size: unknown = Reflect.getOwnPropertyDescriptor(
					collection,
					"size",
				)?.get?.call(current);
				if (
					typeof size !== "number" ||
					values + size * 2 > MAX_SCANNED_VALUES
				) {
					return true;
				}
				Reflect.apply(collection.forEach, current, [
					(entry: unknown, key: unknown) => {
						enqueue(key);
						enqueue(entry);
					},
				]);
			}
			if (
				Array.isArray(current) &&
				values + current.length > MAX_SCANNED_VALUES
			) {
				return true;
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
				const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
				let entry: unknown;
				if (!descriptor || isErrorText(current, key)) {
					// Error text may be inherited or an engine accessor.
					entry = Reflect.get(current, key);
				} else if ("value" in descriptor) {
					entry = descriptor.value;
				} else if (descriptor.enumerable) {
					// `JSON.stringify` would run this getter.
					return true;
				} else {
					continue;
				}
				if (!enqueue(entry)) return true;
			}
		} catch {
			// What cannot be read here may still be read by a logger.
			return true;
		}
	}
	return false;
}

function readString(value: object, key: string): string | undefined {
	try {
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		const result: unknown =
			descriptor && "value" in descriptor
				? descriptor.value
				: isErrorText(value, key)
					? Reflect.get(value, key)
					: lookup(value, key);
		return typeof result === "string" ? result : undefined;
	} catch {
		return undefined;
	}
}

function dataProperty(value: object, key: string): unknown {
	try {
		const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
		return descriptor && "value" in descriptor ? descriptor.value : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Builds an error that keeps the diagnostics of one that may still expose a
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
	let keys: string[] = [];
	try {
		keys = Object.keys(error);
	} catch {
		// Keep the message, name, and stack of an object that cannot be listed.
	}
	for (const key of keys) {
		if (["message", "name", "stack", "cause", "command"].includes(key)) {
			continue;
		}
		const value = dataProperty(error, key);
		if (typeof value === "string") {
			Reflect.set(replacement, key, redactString(value, secrets));
		} else if (["number", "boolean", "bigint"].includes(typeof value)) {
			Reflect.set(replacement, key, value);
		}
	}
	const command = dataProperty(error, "command");
	if (command !== null && typeof command === "object") {
		const commandName = readString(command, "name");
		if (commandName) {
			Reflect.set(replacement, "command", {
				name: redactString(commandName, secrets),
			});
		}
	}
	const cause = dataProperty(error, "cause");
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
 * may remain somewhere it cannot be rewritten, such as a class instance or a
 * frozen object, the error is replaced with one that keeps its redacted
 * message, name, stack, primitive properties, command name, and cause.
 *
 * Reads, writes, property definitions, and spies act on the storage. Storage
 * methods cannot be made non-configurable through the wrapper, so freezing it
 * throws, and locking the storage itself keeps its methods redacted. Results,
 * including synchronous ones, are unchanged.
 */
export function redactSecondaryStorageErrors<T extends SecondaryStorage>(
	storage: T,
): T {
	if (redactedStorages.has(storage)) return storage;
	const existing = proxies.get(storage);
	if (existing) return existing as T;
	// Storage methods and other functions are cached apart, so reading an alias
	// of a storage method cannot replace its redacting wrapper.
	const redacting = new WeakMap<object, unknown>();
	const forwarding = new WeakMap<object, unknown>();
	const originals = new WeakMap<object, unknown>();
	const unwrap = (value: unknown): unknown =>
		(typeof value === "function" && originals.get(value)) || value;
	// The proxy target is an unlocked copy of the storage, so the proxy can
	// return wrapped methods even after the storage is frozen. Only properties
	// made non-configurable through the proxy are locked on the copy.
	const target: T = Object.create(
		Object.getPrototypeOf(storage),
		Object.fromEntries(
			Reflect.ownKeys(storage).map((key) => [
				key,
				{
					...Reflect.getOwnPropertyDescriptor(storage, key),
					configurable: true,
				},
			]),
		),
	);
	const locked = new Set<PropertyKey>();
	const wrap = (property: PropertyKey, value: unknown): unknown => {
		if (
			typeof value !== "function" ||
			property === "constructor" ||
			locked.has(property)
		) {
			return value;
		}
		const isStorageMethod = STORAGE_METHODS.has(property);
		const cache = isStorageMethod ? redacting : forwarding;
		const cached = cache.get(value);
		if (cached) return cached;
		let wrapper: unknown;
		if (isStorageMethod) {
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
			wrapper = call;
		} else {
			// Other functions keep their properties and constructor, and run
			// against the storage, which may keep private state keyed on it.
			wrapper = new Proxy(value, {
				apply: (fn, thisArg, args) =>
					Reflect.apply(fn, thisArg === proxy ? storage : thisArg, args),
			});
		}
		cache.set(value, wrapper);
		originals.set(wrapper as object, value);
		return wrapper;
	};
	const proxy: T = new Proxy(target, {
		get: (_, property) => wrap(property, Reflect.get(storage, property)),
		set: (_, property, value) => Reflect.set(storage, property, unwrap(value)),
		has: (_, property) => Reflect.has(storage, property),
		ownKeys: () => Reflect.ownKeys(storage),
		getPrototypeOf: () => Reflect.getPrototypeOf(storage),
		getOwnPropertyDescriptor(_, property) {
			const descriptor = Reflect.getOwnPropertyDescriptor(storage, property);
			if (!descriptor) return undefined;
			const reported = locked.has(property)
				? descriptor
				: { ...descriptor, configurable: true };
			return "value" in reported
				? { ...reported, value: wrap(property, reported.value) }
				: reported;
		},
		defineProperty(_, property, descriptor) {
			const definition =
				"value" in descriptor
					? { ...descriptor, value: unwrap(descriptor.value) }
					: descriptor;
			const locks = definition.configurable === false;
			if (locks && STORAGE_METHODS.has(property)) return false;
			if (!Reflect.defineProperty(storage, property, definition)) return false;
			if (locks) {
				// Mirror the storage's resulting property, since a partial
				// definition leaves its value and other fields unchanged.
				const resulting = Reflect.getOwnPropertyDescriptor(storage, property);
				if (
					!resulting ||
					!Reflect.defineProperty(target, property, resulting)
				) {
					return false;
				}
				locked.add(property);
			}
			return true;
		},
		deleteProperty: (_, property) =>
			Reflect.deleteProperty(storage, property) &&
			(locked.has(property) || Reflect.deleteProperty(target, property)),
		// Freezing would lock the storage methods, which must stay wrapped.
		preventExtensions: () => false,
	});
	redactedStorages.add(proxy);
	proxies.set(storage, proxy);
	return proxy;
}
