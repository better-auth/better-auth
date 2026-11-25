import type { SecondaryStorage } from "@better-auth/core/db";

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

/**
 * The strings a storage error must not carry: every string argument, as given
 * and as it appears inside a JSON-encoded command.
 */
function secretsOf(args: readonly unknown[]): string[] {
	const secrets = new Set<string>();
	for (const arg of args) {
		if (typeof arg !== "string" || !arg) continue;
		secrets.add(arg);
		secrets.add(JSON.stringify(arg).slice(1, -1));
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

function isTraversable(value: object): boolean {
	if (value instanceof Error || Array.isArray(value)) return true;
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/**
 * Redacts secrets from an error, its own properties, and nested plain objects,
 * arrays, and errors (such as `cause`). Returns `false` when a property that
 * holds a secret cannot be rewritten.
 */
function redactInPlace(
	target: object,
	secrets: readonly string[],
	seen: WeakSet<object>,
	depth: number,
): boolean {
	if (depth > MAX_DEPTH || seen.has(target) || !isTraversable(target)) {
		return true;
	}
	seen.add(target);
	let complete = true;
	const names = new Set(Object.getOwnPropertyNames(target));
	// `message` and `stack` can be accessors, which the loop below skips.
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
		if (typeof current === "string") {
			const redacted = redactString(current, secrets);
			if (redacted !== current && !Reflect.set(target, name, redacted)) {
				complete = false;
			}
		} else if (current !== null && typeof current === "object") {
			complete = redactInPlace(current, secrets, seen, depth + 1) && complete;
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
	// The error could not be rewritten (for example, it is frozen), so replace it.
	const message =
		error instanceof Error ? redactString(error.message, secrets) : "";
	const replacement = new Error(message);
	if (error instanceof Error) replacement.name = error.name;
	return replacement;
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
 * are kept for diagnosis.
 */
export function redactSecondaryStorageErrors(
	storage: SecondaryStorage,
): SecondaryStorage {
	const wrapped = new WeakMap<object, unknown>();
	return new Proxy(storage, {
		get(target, property, receiver) {
			const value: unknown = Reflect.get(target, property, receiver);
			if (
				typeof property !== "string" ||
				!STORAGE_METHODS.has(property) ||
				typeof value !== "function"
			) {
				return value;
			}
			const cached = wrapped.get(value);
			if (cached) return cached;
			const method = async (...args: unknown[]) => {
				try {
					return await Reflect.apply(value, target, args);
				} catch (error) {
					throw redactStorageError(error, args);
				}
			};
			wrapped.set(value, method);
			return method;
		},
	});
}
