import type { BetterAuthOptions, InternalAdapter } from "@better-auth/core";
import {
	getCurrentAdapter,
	queueAfterTransactionHook,
	runAtomicMutation,
} from "@better-auth/core/context";
import type {
	AtomicWriteOperation,
	DBAdapter,
	Where,
} from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { Verification } from "../../types";
import {
	getStorageOption,
	processIdentifier,
} from "../verification-token-storage";
import type { DatabaseHooksEntry } from "../with-hooks";
import { getWithHooks } from "../with-hooks";

type VerificationAdapterMethod =
	| "createVerificationValue"
	| "findVerificationValue"
	| "deleteVerificationByIdentifier"
	| "consumeVerificationValue"
	| "reserveVerificationValue"
	| "updateVerificationByIdentifier";

type VerificationAdapterMethods<Options extends BetterAuthOptions> = Pick<
	InternalAdapter<Options>,
	VerificationAdapterMethod
>;

interface VerificationAdapterContext<Options extends BetterAuthOptions> {
	options: Omit<Options, "logger">;
	hooks: DatabaseHooksEntry[];
}

function getTTLSeconds(expiresAt: Date | number, now = Date.now()): number {
	const expiresMs =
		typeof expiresAt === "number" ? expiresAt : expiresAt.getTime();
	return Math.max(Math.floor((expiresMs - now) / 1000), 0);
}

const VERIFICATION_SNAPSHOT_INITIAL_LIMIT = 128;
const VERIFICATION_SNAPSHOT_MAX_LIMIT = 4096;
const VERIFICATION_DELETE_CHUNK_SIZE = 100;

function orderVerificationSnapshot(
	rows: readonly Verification[],
): Verification[] {
	return [...rows].sort((left, right) => {
		const createdAtDifference =
			right.createdAt.getTime() - left.createdAt.getTime();
		if (createdAtDifference) return createdAtDifference;
		if (left.id === right.id) return 0;
		return left.id < right.id ? 1 : -1;
	});
}

function getVerificationSiblingIdChunks(
	snapshot: readonly Verification[],
): string[][] {
	const siblingIds = snapshot.slice(1).map((verification) => verification.id);
	const chunks: string[][] = [];
	for (
		let offset = 0;
		offset < siblingIds.length;
		offset += VERIFICATION_DELETE_CHUNK_SIZE
	) {
		chunks.push(
			siblingIds.slice(offset, offset + VERIFICATION_DELETE_CHUNK_SIZE),
		);
	}
	return chunks;
}

function getVerificationSnapshotWhere(verification: Verification): Where[] {
	return [
		{ field: "id", value: verification.id },
		{ field: "identifier", value: verification.identifier },
		{ field: "value", value: verification.value },
		{ field: "expiresAt", value: verification.expiresAt },
		{ field: "createdAt", value: verification.createdAt },
		{ field: "updatedAt", value: verification.updatedAt },
	];
}

export function createVerificationAdapterMethods<
	Options extends BetterAuthOptions,
>(
	adapter: DBAdapter<Options>,
	ctx: VerificationAdapterContext<Options>,
): VerificationAdapterMethods<Options> {
	const options = ctx.options;
	const secondaryStorage = options.secondaryStorage;
	const {
		createWithHooks,
		prepareDeleteWithHooks,
		updateWithHooks,
		deleteManyWithHooks,
		consumeOneWithHooks,
	} = getWithHooks(adapter, ctx);

	return {
		createVerificationValue: async (
			data: Omit<Verification, "createdAt" | "id" | "updatedAt"> &
				Partial<Verification>,
		) => {
			const storageOption = getStorageOption(
				data.identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				data.identifier,
				storageOption,
			);

			const verification = await createWithHooks(
				{
					// todo: we should remove auto setting createdAt and updatedAt in the next major release, since the db generators already handle that
					createdAt: new Date(),
					updatedAt: new Date(),
					...data,
					identifier: storedIdentifier,
				},
				"verification",
				secondaryStorage
					? {
							async fn(verificationData) {
								const ttl = getTTLSeconds(verificationData.expiresAt);
								if (ttl > 0) {
									await secondaryStorage.set(
										`verification:${storedIdentifier}`,
										JSON.stringify(verificationData),
										ttl,
									);
								}
								return verificationData;
							},
							executeMainFn: options.verification?.storeInDatabase,
						}
					: undefined,
			);
			return verification as Verification;
		},
		findVerificationValue: async (identifier: string) => {
			const storageOption = getStorageOption(
				identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				identifier,
				storageOption,
			);

			if (secondaryStorage) {
				const cached = await secondaryStorage.get(
					`verification:${storedIdentifier}`,
				);
				if (cached) {
					const parsed = safeJSONParse<Verification>(cached);
					if (parsed) {
						return parsed;
					}
				}
				if (storageOption && storageOption !== "plain") {
					const plainCached = await secondaryStorage.get(
						`verification:${identifier}`,
					);
					if (plainCached) {
						const parsed = safeJSONParse<Verification>(plainCached);
						if (parsed) {
							return parsed;
						}
					}
				}
				if (!options.verification?.storeInDatabase) {
					return null;
				}
			}

			const currentAdapter = await getCurrentAdapter(adapter);

			async function findByIdentifier(id: string) {
				return currentAdapter.findMany<Verification>({
					model: "verification",
					where: [{ field: "identifier", value: id }],
					sortBy: { field: "createdAt", direction: "desc" },
					limit: 1,
				});
			}

			let verification = await findByIdentifier(storedIdentifier);

			if (!verification.length && storageOption && storageOption !== "plain") {
				verification = await findByIdentifier(identifier);
			}

			if (!options.verification?.disableCleanup) {
				await deleteManyWithHooks(
					[
						{
							field: "expiresAt",
							value: new Date(),
							operator: "lt",
						},
					],
					"verification",
					undefined,
				);
			}

			return (verification[0] as Verification) || null;
		},
		deleteVerificationByIdentifier: async (identifier: string) => {
			const storageOption = getStorageOption(
				identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				identifier,
				storageOption,
			);

			const identifiers =
				storedIdentifier === identifier
					? [storedIdentifier]
					: [storedIdentifier, identifier];

			for (const identifierToDelete of identifiers) {
				if (secondaryStorage) {
					await secondaryStorage.delete(`verification:${identifierToDelete}`);
				}

				if (!secondaryStorage || options.verification?.storeInDatabase) {
					await deleteManyWithHooks(
						[{ field: "identifier", value: identifierToDelete }],
						"verification",
						undefined,
					);
				}
			}
		},
		/**
		 * Atomically consume a single-use verification row by `identifier` and
		 * return it. Within one captured identifier generation, the first concurrent
		 * caller receives the latest row and every other caller receives `null`.
		 *
		 * Race-safe replacement for the `findVerificationValue` then
		 * `deleteVerificationByIdentifier` pair. Callers MUST gate any state
		 * change (issue session, mint token, change password) on a non-null
		 * return value, because consuming one row invalidates every row captured
		 * for that identifier and stale rows cannot be replayed. A replacement
		 * issued after the consumption snapshot remains available.
		 *
		 * Rows past their `expiresAt` are treated as already invalid: the row
		 * is still deleted (so it cannot be replayed later) but `null` is
		 * returned. Callers do not need their own `expiresAt` gate.
		 *
		 * Database-backed consumption requires a native transaction or atomic
		 * batch capability and fails before hooks, reads, or writes otherwise.
		 *
		 * The secondary-storage-only path (`storeInDatabase: false`) consumes
		 * through `getAndDelete`, which is required on `SecondaryStorage` so
		 * single-use values are not read and deleted as separate operations.
		 */
		consumeVerificationValue: async (
			identifier: string,
		): Promise<Verification | null> => {
			const storageOption = getStorageOption(
				identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				identifier,
				storageOption,
			);
			const identifierWhere = [
				{ field: "identifier", value: storedIdentifier },
			];
			const verificationCacheKey = `verification:${storedIdentifier}`;

			// After a JSON round-trip `expiresAt` arrives as a string, so coerce
			// it back to a valid `Date` to match what the DB adapter returns.
			const hydrateCachedVerification = (raw: unknown): Verification | null => {
				if (!raw) return null;
				const candidate =
					typeof raw === "string"
						? safeJSONParse<Verification>(raw)
						: typeof raw === "object"
							? (raw as Verification)
							: null;
				if (!candidate) return null;
				const expiresAt = new Date(candidate.expiresAt);
				if (!Number.isFinite(expiresAt.getTime())) return null;
				return { ...candidate, expiresAt };
			};

			const findIdentifierSnapshot = async (): Promise<Verification[]> => {
				const currentAdapter = await getCurrentAdapter(adapter);
				let limit = VERIFICATION_SNAPSHOT_INITIAL_LIMIT;
				while (true) {
					const rows = await currentAdapter.findMany<Verification>({
						model: "verification",
						where: identifierWhere,
						sortBy: { field: "createdAt", direction: "desc" },
						limit,
					});
					if (rows.length < limit) return orderVerificationSnapshot(rows);
					if (limit === VERIFICATION_SNAPSHOT_MAX_LIMIT) {
						throw new BetterAuthError(
							"Verification identifier has too many rows to consume atomically.",
						);
					}
					limit = Math.min(limit * 2, VERIFICATION_SNAPSHOT_MAX_LIMIT);
				}
			};

			const getSiblingDeleteOperations = (
				snapshot: readonly Verification[],
			): AtomicWriteOperation[] =>
				getVerificationSiblingIdChunks(snapshot).map((ids) => ({
					type: "deleteMany",
					model: "verification",
					where: [{ field: "id", operator: "in", value: ids }],
				}));

			let consumed: Verification | null = null;

			if (secondaryStorage && !options.verification?.storeInDatabase) {
				consumed = hydrateCachedVerification(
					await secondaryStorage.getAndDelete(verificationCacheKey),
				);
			} else {
				const consumeStoredIdentifier =
					async (): Promise<Verification | null> => {
						return runAtomicMutation(adapter, {
							runInTransaction: async () => {
								const identifierSnapshot = await findIdentifierSnapshot();
								const latest = identifierSnapshot[0] ?? null;
								if (!latest) return null;
								const txAdapter = await getCurrentAdapter(adapter);
								return consumeOneWithHooks<Verification>(
									"verification",
									[{ field: "id", value: latest.id }],
									async () => {
										const row = await txAdapter.consumeOne<Verification>({
											model: "verification",
											where: getVerificationSnapshotWhere(latest),
										});
										if (!row) return null;
										for (const ids of getVerificationSiblingIdChunks(
											identifierSnapshot,
										)) {
											await txAdapter.deleteMany({
												model: "verification",
												where: [{ field: "id", operator: "in", value: ids }],
											});
										}
										return row;
									},
									latest,
								);
							},
							prepareAtomicWrites: async () => {
								const identifierSnapshot = await findIdentifierSnapshot();
								const latest = identifierSnapshot[0] ?? null;
								if (!latest) {
									return {
										operations: [],
										afterCommit: () => null,
									};
								}
								const preparedDelete =
									await prepareDeleteWithHooks<Verification>(
										[{ field: "id", value: latest.id }],
										"verification",
										{ entities: [latest], requireSnapshot: true },
									);
								if (!preparedDelete) {
									return {
										operations: [],
										afterCommit: () => null,
									};
								}

								return {
									operations: [
										{
											type: "delete" as const,
											model: "verification",
											where: getVerificationSnapshotWhere(latest),
										},
										...getSiblingDeleteOperations(identifierSnapshot),
									],
									afterCommit: async (results) => {
										const winnerGate = results[0];
										if (!winnerGate || winnerGate.type !== "delete") {
											throw new BetterAuthError(
												"Atomic verification consumption did not return its winner gate result.",
											);
										}
										if (winnerGate.deletedCount === 0) return null;
										await preparedDelete.queueAfterHooks([latest]);
										return latest;
									},
								};
							},
						});
					};

				consumed = await consumeStoredIdentifier();

				if (consumed && secondaryStorage) {
					await secondaryStorage.delete(verificationCacheKey);
				}
			}

			// Single expiry gate. A row past its `expiresAt` is treated as already
			// invalid, so callers can rely on a non-null return meaning "valid".
			if (!consumed || consumed.expiresAt < new Date()) return null;
			return consumed;
		},
		/**
		 * First-writer-wins create keyed by a deterministic primary key derived
		 * from `identifier`. Returns `true` when this caller created the row and
		 * `false` when a row for the same identifier already existed.
		 *
		 * The dual of `consumeVerificationValue`: where consume races to delete a
		 * marker exactly once, reserve races to create a marker exactly once. Use
		 * it for replay tombstones (a SAML assertion id, a JWT `jti`) where the
		 * first caller wins and every later caller must observe that the marker is
		 * already taken.
		 *
		 * The `verification.identifier` column is non-unique, so uniqueness comes
		 * from a deterministic primary key (`SHA-256` of `reserve:<identifier>`).
		 * The database path is atomic: the primary key turns the INSERT into the
		 * first-writer-wins gate, and a duplicate is detected portably by
		 * re-reading the row rather than matching adapter-specific errors.
		 * Secondary-storage-only verification cannot enforce the deterministic
		 * primary-key gate, so this operation fails closed unless verification is
		 * backed by the database.
		 *
		 * The atomic guarantee requires the configured adapter to reject a
		 * duplicate primary key on insert, which every real database enforces. The
		 * in-memory adapter does not enforce primary-key uniqueness, so reservation
		 * is best-effort there (it is intended for development and tests).
		 */
		reserveVerificationValue: async (data: {
			identifier: string;
			value: string;
			expiresAt: Date;
		}): Promise<boolean> => {
			const reservationId = base64Url.encode(
				new Uint8Array(
					await createHash("SHA-256").digest(
						new TextEncoder().encode("reserve:" + data.identifier),
					),
				),
				{ padding: false },
			);
			const storageOption = getStorageOption(
				data.identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				data.identifier,
				storageOption,
			);

			if (secondaryStorage && !options.verification?.storeInDatabase) {
				throw new BetterAuthError(
					"reserveVerificationValue requires database-backed verification storage. Set verification.storeInDatabase to true for flows that reserve verification values.",
				);
			}
			const currentAdapter = await getCurrentAdapter(adapter);

			try {
				await currentAdapter.create({
					model: "verification",
					data: {
						id: reservationId,
						identifier: storedIdentifier,
						value: data.value,
						expiresAt: data.expiresAt,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
					forceAllowId: true,
				});
			} catch (error) {
				// A create error is ambiguous across adapters: confirm it was a
				// duplicate (the row exists) rather than a real failure before
				// reporting "lost".
				const existing = await currentAdapter.findOne<Verification>({
					model: "verification",
					where: [{ field: "id", value: reservationId }],
				});
				if (existing) return false;
				throw error;
			}

			if (secondaryStorage) {
				const ttl = getTTLSeconds(data.expiresAt);
				if (ttl > 0) {
					await queueAfterTransactionHook(async () => {
						await secondaryStorage.set(
							`verification:${storedIdentifier}`,
							JSON.stringify({
								id: reservationId,
								identifier: storedIdentifier,
								value: data.value,
								expiresAt: data.expiresAt,
							}),
							ttl,
						);
					});
				}
			}

			return true;
		},
		updateVerificationByIdentifier: async (
			identifier: string,
			data: Partial<Verification>,
		) => {
			const storageOption = getStorageOption(
				identifier,
				options.verification?.storeIdentifier,
			);
			const storedIdentifier = await processIdentifier(
				identifier,
				storageOption,
			);

			if (secondaryStorage) {
				const cached = await secondaryStorage.get(
					`verification:${storedIdentifier}`,
				);
				if (cached) {
					const parsed = safeJSONParse<Verification>(cached);
					if (parsed) {
						const updated = { ...parsed, ...data };
						const expiresAt = updated.expiresAt ?? parsed.expiresAt;
						const ttl = getTTLSeconds(
							expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
						);
						if (ttl > 0) {
							await secondaryStorage.set(
								`verification:${storedIdentifier}`,
								JSON.stringify(updated),
								ttl,
							);
						}
						if (!options.verification?.storeInDatabase) {
							return updated;
						}
					}
				}
			}

			if (!secondaryStorage || options.verification?.storeInDatabase) {
				const verification = await updateWithHooks<Verification>(
					data,
					[{ field: "identifier", value: storedIdentifier }],
					"verification",
					undefined,
				);
				return verification;
			}
			return data as Verification;
		},
	};
}
