import type {
	BetterAuthOptions,
	GenericEndpointContext,
	InternalAdapter,
	VerificationAttemptResult,
} from "@better-auth/core";
import { getCurrentAdapter } from "@better-auth/core/context";
import type { SecondaryStorage, Verification } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { getWithHooks } from "./with-hooks";

type VerifyOptions = Parameters<InternalAdapter["verifyVerificationValue"]>[1];

type AttemptHooks = Pick<
	ReturnType<typeof getWithHooks>,
	"consumeOneWithHooks" | "incrementOneWithHooks"
>;

// Each retry follows a write by another request: a counted attempt, or one
// returned after a check-only call.
const CONTENTION_RETRIES = 5;

/**
 * Splits a stored value into the code and the attempts counted against it. A
 * value without a numeric `:<attempts>` suffix is a code with none counted.
 */
function splitVerificationAttempts(value: string): [string, number] {
	const index = value.lastIndexOf(":");
	const count = index === -1 ? "" : value.slice(index + 1);
	if (!/^\d+$/.test(count)) return [value, 0];
	return [value.slice(0, index), Number(count)];
}

function isExpired(verification: Verification) {
	return new Date(verification.expiresAt).getTime() <= Date.now();
}

/**
 * An attempt count outlives its code by one more lifetime. A reuse resend
 * that raced the first counted guess can extend the code once before it sees
 * the count, and `increment` sets the expiry only when it creates the key.
 */
function attemptCountTtl(verification: Verification) {
	const expiresAt = new Date(verification.expiresAt).getTime();
	const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
	const lifetime = Math.ceil(
		(expiresAt - new Date(verification.createdAt).getTime()) / 1000,
	);
	return Math.max(
		remaining + (Number.isFinite(lifetime) ? lifetime : remaining),
		1,
	);
}

function hydrate(raw: unknown): Verification | null {
	const parsed =
		typeof raw === "string"
			? safeJSONParse<Verification>(raw)
			: raw && typeof raw === "object"
				? (raw as Verification)
				: null;
	if (!parsed || typeof parsed.value !== "string") return null;
	const expiresAt = new Date(parsed.expiresAt);
	if (!Number.isFinite(expiresAt.getTime())) return null;
	return { ...parsed, expiresAt };
}

function isSameCode(a: Verification, b: Verification) {
	return (
		a.value === b.value &&
		Object.is(new Date(a.createdAt).getTime(), new Date(b.createdAt).getTime())
	);
}

/**
 * Secondary storage cannot change a value conditionally, so attempts are
 * counted under keys derived from the code and when it was issued. A newer
 * code gets new keys.
 */
async function attemptKeys(key: string, verification: Verification) {
	const digest = base64Url.encode(
		new Uint8Array(
			await createHash("SHA-256").digest(
				new TextEncoder().encode(
					[
						key,
						verification.value,
						new Date(verification.createdAt).getTime(),
					].join("\n"),
				),
			),
		),
		{ padding: false },
	);
	return {
		counted: `verification-attempts:${digest}`,
		returned: `verification-attempts-returned:${digest}`,
	};
}

async function verifyInSecondaryStorage(
	storage: SecondaryStorage,
	identifiers: string[],
	{ allowedAttempts, matches, keep }: VerifyOptions,
): Promise<VerificationAttemptResult> {
	let key: string | undefined;
	let stored: Verification | null = null;
	for (const identifier of identifiers) {
		key = `verification:${identifier}`;
		stored = hydrate(await storage.get(key));
		if (stored) break;
	}
	if (!stored || !key) return { status: "missing" };
	if (isExpired(stored)) return { status: "expired" };

	const [code, attemptsInValue] = splitVerificationAttempts(stored.value);
	const keys = await attemptKeys(key, stored);
	const ttl = attemptCountTtl(stored);
	const readCount = async (key: string) =>
		Number((await storage.get(key)) ?? 0) || 0;
	// The code stays stored, since a request holding the last attempt may
	// still be comparing a correct guess. Reading the count first keeps a
	// refused attempt from taking an attempt such a check returns.
	if (
		attemptsInValue +
			(await readCount(keys.counted)) -
			(await readCount(keys.returned)) >=
		allowedAttempts
	) {
		return { status: "exhausted" };
	}
	// The claim itself is the bound. A refused claim returns the attempt it
	// took, so a request that passed the read above alongside a check that
	// keeps the code cannot leave the follow-up call without one.
	const counted = Number(await storage.increment(keys.counted, ttl));
	const returned = await readCount(keys.returned);
	if (attemptsInValue + counted - returned > allowedAttempts) {
		await storage.increment(keys.returned, ttl);
		return { status: "exhausted" };
	}

	if (!(await matches(code))) return { status: "invalid" };
	// A slow comparison can outlast the code.
	if (isExpired(stored)) return { status: "expired" };

	if (keep) {
		const current = hydrate(await storage.get(key));
		if (!current || !isSameCode(current, stored)) {
			return { status: "superseded" };
		}
		await storage.increment(keys.returned, ttl);
		return { status: "verified", verification: stored };
	}

	// A code sent during the comparison replaced this one, so it stays.
	const current = hydrate(await storage.get(key));
	if (!current || !isSameCode(current, stored)) {
		return { status: "superseded" };
	}
	const taken = hydrate(await storage.getAndDelete(key));
	// Without a conditional delete, a code sent between these two calls is
	// taken instead. It is dropped rather than written back, since writing back
	// could revive a code that was used.
	if (!taken || !isSameCode(taken, stored)) return { status: "superseded" };
	await Promise.all(
		identifiers
			.map((identifier) => `verification:${identifier}`)
			.filter((other) => other !== key)
			.map((other) => storage.delete(other)),
	);
	return { status: "verified", verification: taken };
}

async function verifyInDatabase(
	adapter: DBAdapter<BetterAuthOptions>,
	hooks: AttemptHooks,
	identifiers: string[],
	{ allowedAttempts, matches, keep }: VerifyOptions,
	invalidateCache: () => Promise<void>,
): Promise<VerificationAttemptResult> {
	const db = await getCurrentAdapter(adapter);
	const retries = allowedAttempts + CONTENTION_RETRIES;
	const findById = (id: string) =>
		db.findOne<Verification>({
			model: "verification",
			where: [{ field: "id", value: id }],
		});
	// Re-reads a row after a guarded write missed. The write is retried only
	// when another request changed the attempt count of the same code.
	const reread = async (row: Verification, code: string) => {
		const current = await findById(row.id);
		if (!current || current.value === row.value) return null;
		return splitVerificationAttempts(current.value)[0] === code
			? current
			: null;
	};
	const writeAttempts = (row: Verification, code: string, attempts: number) =>
		hooks.incrementOneWithHooks<Verification>(
			"verification",
			{ value: `${code}:${attempts}`, updatedAt: new Date() },
			(set) =>
				db.incrementOne<Verification>({
					model: "verification",
					where: [
						{ field: "id", value: row.id },
						{ field: "value", value: row.value },
						{ field: "expiresAt", operator: "gt", value: new Date() },
					],
					increment: {},
					set,
				}),
		);
	// Consumes the row together with any older row of the identifier, which a
	// lookup would otherwise return once this one is gone.
	const consume = async (row: Verification, code: string) => {
		let current: Verification | null = row;
		for (let retry = 0; current && retry <= retries; retry++) {
			const target: Verification = current;
			const taken = await hooks.consumeOneWithHooks<Verification>(
				"verification",
				[{ field: "id", value: target.id }],
				async () => {
					await db.deleteMany({
						model: "verification",
						where: [
							{ field: "identifier", operator: "in", value: identifiers },
							{ field: "id", operator: "ne", value: target.id },
							{
								field: "createdAt",
								operator: "lte",
								value: target.createdAt,
							},
						],
					});
					return db.consumeOne<Verification>({
						model: "verification",
						where: [
							{ field: "id", value: target.id },
							{ field: "value", value: target.value },
							{ field: "expiresAt", operator: "gt", value: new Date() },
						],
					});
				},
				target,
			);
			if (taken) {
				await invalidateCache();
				return taken;
			}
			current = await reread(target, code);
		}
		return null;
	};

	let latest: Verification | undefined;
	for (const identifier of identifiers) {
		[latest] = await db.findMany<Verification>({
			model: "verification",
			where: [{ field: "identifier", value: identifier }],
			sortBy: { field: "createdAt", direction: "desc" },
			limit: 1,
		});
		if (latest) break;
	}
	if (!latest) return { status: "missing" };

	let row: Verification = latest;
	const [code] = splitVerificationAttempts(row.value);
	let claimed: Verification;
	for (let retry = 0; ; retry++) {
		if (isExpired(row)) return { status: "expired" };
		const [, attempts] = splitVerificationAttempts(row.value);
		// The code stays stored, since a request holding the last attempt may
		// still be comparing a correct guess.
		if (attempts >= allowedAttempts) return { status: "exhausted" };
		const result = await writeAttempts(row, code, attempts + 1);
		if (result === false) return { status: "vetoed" };
		if (result) {
			claimed = result;
			break;
		}
		const current = retry < retries ? await reread(row, code) : null;
		if (!current) {
			return { status: isExpired(row) ? "expired" : "superseded" };
		}
		row = current;
	}
	await invalidateCache();

	if (!(await matches(code))) return { status: "invalid" };
	// A slow comparison can outlast the code.
	if (isExpired(claimed)) return { status: "expired" };

	if (!keep) {
		const taken = await consume(claimed, code);
		if (taken) return { status: "verified", verification: taken };
		return { status: isExpired(claimed) ? "expired" : "superseded" };
	}

	let current: Verification | null = claimed;
	for (let retry = 0; current && retry <= retries; retry++) {
		const [, attempts] = splitVerificationAttempts(current.value);
		if (attempts === 0) return { status: "verified", verification: current };
		const returned = await writeAttempts(current, code, attempts - 1);
		if (returned === false) return { status: "vetoed" };
		if (returned) {
			await invalidateCache();
			return { status: "verified", verification: returned };
		}
		const previous: Verification = current;
		current = await reread(previous, code);
		if (!current && isExpired(previous)) return { status: "expired" };
	}
	return { status: "superseded" };
}

/**
 * Implements `InternalAdapter.verifyVerificationValue` for the identifiers a
 * code may be stored under, the hashed one first. The database is the source
 * of truth whenever it stores verification values, and a cached copy is
 * deleted after each write instead of being rewritten.
 */
export function verifyVerificationAttempt(
	{
		adapter,
		hooks,
		secondaryStorage,
		storeInDatabase,
	}: {
		adapter: DBAdapter<BetterAuthOptions>;
		hooks: AttemptHooks;
		secondaryStorage: SecondaryStorage | undefined;
		storeInDatabase: boolean | undefined;
	},
	identifiers: string[],
	options: VerifyOptions,
): Promise<VerificationAttemptResult> {
	if (secondaryStorage && !storeInDatabase) {
		return verifyInSecondaryStorage(secondaryStorage, identifiers, options);
	}
	return verifyInDatabase(adapter, hooks, identifiers, options, async () => {
		if (!secondaryStorage) return;
		await Promise.all(
			identifiers.map((identifier) =>
				secondaryStorage.delete(`verification:${identifier}`),
			),
		);
	});
}

/**
 * Whether secondary storage counted attempts beside `verification`. Such a
 * code should not have its expiry extended, since its attempt count keeps
 * the original expiry.
 */
export async function hasAttemptsBesideValue(
	ctx: GenericEndpointContext,
	verification: Verification,
): Promise<boolean> {
	const { secondaryStorage, options } = ctx.context;
	if (!secondaryStorage || options.verification?.storeInDatabase) return false;
	const keys = await attemptKeys(
		`verification:${verification.identifier}`,
		verification,
	);
	return Number((await secondaryStorage.get(keys.counted)) ?? 0) > 0;
}

/**
 * The attempts counted against `verification`, including those secondary
 * storage counts beside its value.
 */
export async function countVerificationAttempts(
	ctx: GenericEndpointContext,
	verification: Verification,
): Promise<number> {
	const [, attemptsInValue] = splitVerificationAttempts(verification.value);
	const { secondaryStorage, options } = ctx.context;
	if (!secondaryStorage || options.verification?.storeInDatabase) {
		return attemptsInValue;
	}
	const keys = await attemptKeys(
		`verification:${verification.identifier}`,
		verification,
	);
	const readCount = async (key: string) =>
		Number((await secondaryStorage.get(key)) ?? 0) || 0;
	return (
		attemptsInValue +
		(await readCount(keys.counted)) -
		(await readCount(keys.returned))
	);
}
