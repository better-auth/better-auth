import type { InternalLogger } from "@better-auth/core/env";
import { BetterAuthError } from "@better-auth/core/error";
import { deprecate } from "@better-auth/core/utils/deprecate";

/**
 * Bridge for databases that still carry the required `issuer` column Better
 * Auth 1.7.0 through 1.7.2 added to the `account` table.
 *
 * Accounts are recognized by `providerId` and `accountId` again, so no release
 * writes that column. A deployment that applied the 1.7 account schema and did
 * not relax the column fails every account insert with a driver error naming a
 * column the application never mentions. This module points that failure at the
 * upgrade guide. It is a signpost, not a fallback: the correction is DDL the
 * deployment owner runs, and a driver that fills an implicit default instead of
 * failing never reaches this code.
 *
 * Delete this file and its call sites in `internal-adapter.ts` to remove the
 * signpost. Nothing else depends on it.
 */

const LEGACY_COLUMN = "issuer";
const LEGACY_INDEX = "account_issuer_accountId_uidx";
const UPGRADE_GUIDE =
	"https://www.better-auth.com/docs/guides/1-7-upgrade-guide#account-identity-keeps-the-provider-key";

const REMEDIATION =
	`The "account" table still requires the "${LEGACY_COLUMN}" column added in Better Auth 1.7.0. ` +
	"Accounts are recognized by their provider ID and account ID again, so Better Auth never writes that column and its NOT NULL constraint rejects every sign-up and account link. " +
	`Drop the constraint, then the "${LEGACY_INDEX}" index. See ${UPGRADE_GUIDE}`;

/**
 * A driver reports the missing value by column name. The leftover unique index
 * carries the same word, so a duplicate key keeps its own error.
 */
function namesLegacyColumn(error: unknown): boolean {
	const message = (
		error instanceof Error ? error.message : String(error)
	).toLowerCase();
	return (
		message.includes(LEGACY_COLUMN) &&
		!message.includes(LEGACY_INDEX.toLowerCase())
	);
}

/**
 * Wraps an account insert so a leftover 1.7 `issuer` column names itself.
 */
export function createLegacyAccountIssuerGuard(logger: InternalLogger) {
	const warnOnce = deprecate(() => {}, REMEDIATION, logger);

	return async function guardAccountInsert<T>(
		insert: () => Promise<T>,
	): Promise<T> {
		try {
			return await insert();
		} catch (error) {
			if (!namesLegacyColumn(error)) {
				throw error;
			}
			warnOnce();
			throw new BetterAuthError(REMEDIATION, { cause: error });
		}
	};
}
