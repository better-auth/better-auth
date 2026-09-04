/**
 * Compatibility shim for databases that still carry the required `issuer`
 * column Better Auth 1.7.0 through 1.7.2 added to the `account` table.
 *
 * Accounts are recognized by `providerId` and `accountId` again, so no release
 * writes that column and its NOT NULL constraint rejects every account insert.
 * The adapter builds each insert from its schema, and a transaction rebuilds
 * that schema from the options, so the column has to be known before the first
 * write. Before the first transaction this shim builds a candidate adapter
 * from a copy of the options that declares the column, and selects the column
 * through it. The database answers once: the candidate becomes the adapter and
 * every account insert carries the value 1.7 used, or the candidate is dropped
 * and the database is never asked again. The application's options object is
 * never modified.
 *
 * Delete this file, its two `init` call sites, and its use in
 * `internal-adapter.ts` to remove the shim. Nothing else depends on it.
 */

import type { BetterAuthOptions } from "@better-auth/core";
import type { DBFieldAttribute } from "@better-auth/core/db";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import type { InternalLogger } from "@better-auth/core/env";
import { deprecate } from "@better-auth/core/utils/deprecate";

const LEGACY_COLUMN = "issuer";
const LEGACY_INDEX = "account_issuer_accountId_uidx";
const UPGRADE_GUIDE =
	"https://www.better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key";
const HANDLE = Symbol("legacyAccountIssuer");
/**
 * Stores without a fixed schema cannot hold the constraint this shim answers.
 */
const SCHEMALESS_ADAPTERS = new Set(["memory", "mongodb-adapter"]);

const REMEDIATION =
	`The "account" table still requires the "${LEGACY_COLUMN}" column added in Better Auth 1.7.0. ` +
	"Better Auth fills it so sign-ups keep working, but it no longer reads that column. " +
	`Drop its NOT NULL constraint and the "${LEGACY_INDEX}" index. ` +
	`This fallback is temporary and will be removed in a later release. See ${UPGRADE_GUIDE}`;

/**
 * The value 1.7 wrote for a provider-scoped account identity.
 */
function legacyIssuerValue(providerId: string): string {
	return `local:oauth:${encodeURIComponent(providerId)}`;
}

/**
 * A constraint on the column reports it by name.
 */
function reportsMissingColumn(error: unknown): boolean {
	const message = (
		error instanceof Error ? error.message : String(error)
	).toLowerCase();
	return message.includes(LEGACY_COLUMN);
}

export interface LegacyAccountIssuer {
	/**
	 * Resolves once the column is known to be present or absent. Never rejects.
	 */
	ready(): Promise<void>;
	/**
	 * Adds the legacy value to an account insert when the column is present.
	 */
	fill<T extends Record<string, unknown>>(data: T): T;
	/**
	 * Asks the database again on the next write when an insert failed on the
	 * column before it was declared, which only happens when the first probe
	 * could not reach the database.
	 */
	rearm(error: unknown): void;
}

export function getLegacyAccountIssuer(
	adapter: DBAdapter<BetterAuthOptions>,
): LegacyAccountIssuer | undefined {
	return (
		adapter as unknown as Record<symbol, LegacyAccountIssuer | undefined>
	)[HANDLE];
}

export function withLegacyAccountIssuer(
	adapter: DBAdapter<BetterAuthOptions>,
	rebuild: (
		options: BetterAuthOptions,
	) => Promise<DBAdapter<BetterAuthOptions>>,
	options: BetterAuthOptions,
	logger: InternalLogger,
): DBAdapter<BetterAuthOptions> {
	const warnOnce = deprecate(() => {}, REMEDIATION, logger);
	let inner = adapter;
	let pending: Promise<void> | null = null;
	let declared: DBFieldAttribute | null = null;

	async function reconcile(): Promise<void> {
		if (SCHEMALESS_ADAPTERS.has(adapter.id)) return;
		// A field the application declared itself is the application's to fill.
		if (options.account?.additionalFields?.[LEGACY_COLUMN]) return;

		// The adapter resolves field names from its schema before it talks to the
		// database, so only an adapter that already declares the column can ask
		// the database whether the column exists. 1.7 let `account.fields.issuer`
		// rename the column; a configuration that still carries it names the
		// physical column exactly as 1.7 did.
		const fields = options.account?.fields as
			| Record<string, string | undefined>
			| undefined;
		const attribute: DBFieldAttribute = {
			type: "string",
			required: false,
			returned: false,
			fieldName: fields?.[LEGACY_COLUMN],
		};
		const candidate = await rebuild({
			...options,
			account: {
				...options.account,
				additionalFields: {
					...options.account?.additionalFields,
					[LEGACY_COLUMN]: attribute,
				},
			},
		});
		try {
			await candidate.findMany({
				model: "account",
				select: [LEGACY_COLUMN],
				limit: 1,
			});
		} catch {
			// The database, or the application's own ORM schema, rejects the column.
			// Either way this instance must not write it. A shim never fails a
			// write on its own: an unreachable database surfaces through the write
			// itself, and `rearm` asks again afterwards.
			return;
		}
		declared = attribute;
		inner = candidate;
		warnOnce();
	}

	const handle: LegacyAccountIssuer = {
		ready: () => (pending ??= reconcile()),
		rearm: (error) => {
			if (!declared && reportsMissingColumn(error)) pending = null;
		},
		fill: (data) => {
			const providerId = data.providerId;
			return declared && typeof providerId === "string"
				? { ...data, [LEGACY_COLUMN]: legacyIssuerValue(providerId) }
				: data;
		},
	};

	const facade: Pick<DBAdapter<BetterAuthOptions>, "transaction"> = {
		transaction: async (callback) => {
			await handle.ready();
			return inner.transaction(callback);
		},
	};
	const owner = (key: PropertyKey) =>
		Object.hasOwn(facade, key) ? facade : inner;

	return new Proxy(facade as DBAdapter<BetterAuthOptions>, {
		get: (_target, key) =>
			key === HANDLE
				? handle
				: Reflect.get(owner(key), key as keyof DBAdapter<BetterAuthOptions>),
		set: (_target, key, value) => Reflect.set(owner(key), key, value),
		has: (_target, key) => key in facade || key in inner,
		deleteProperty: (_target, key) => Reflect.deleteProperty(owner(key), key),
		defineProperty: (_target, key, descriptor) =>
			Reflect.defineProperty(owner(key), key, descriptor),
		getOwnPropertyDescriptor: (_target, key) =>
			Reflect.getOwnPropertyDescriptor(owner(key), key),
		ownKeys: () => [
			...new Set([...Reflect.ownKeys(facade), ...Reflect.ownKeys(inner)]),
		],
	});
}
