/**
 * Kysely's internal migration table names, mirrored as local constants.
 *
 * Kysely 0.29 moved these from its main entry to the `kysely/migration`
 * subpath (which 0.28 lacks), and the main entry now exports only type stubs
 * with no runtime value, which breaks strict ESM bundlers such as Turbopack.
 * The values are a stable part of Kysely's public migration contract, so
 * mirroring them lets the SQLite dialects run on both Kysely 0.28 and 0.29
 * without importing from a moving path.
 * TODO: Revisit this mirror if Better Auth drops Kysely 0.28 support and can
 * depend on Kysely's `kysely/migration` export.
 *
 * @see https://github.com/better-auth/better-auth/issues/9810
 */
export const DEFAULT_MIGRATION_TABLE = "kysely_migration";
export const DEFAULT_MIGRATION_LOCK_TABLE = "kysely_migration_lock";
