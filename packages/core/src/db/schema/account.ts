import * as z from "zod";
import type { Prettify } from "../../types";
import type { BetterAuthOptions } from "../../types/init-options";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import { coreSchema } from "./shared";

export const accountSchema = coreSchema.extend({
	providerId: z.string(),
	accountId: z.string(),
	userId: z.coerce.string(),
	accessToken: z.string().nullish(),
	refreshToken: z.string().nullish(),
	idToken: z.string().nullish(),
	/**
	 * Access token expires at
	 */
	accessTokenExpiresAt: z.date().nullish(),
	/**
	 * Refresh token expires at
	 */
	refreshTokenExpiresAt: z.date().nullish(),
	/**
	 * The scopes the user has granted, as last observed (durable, per-account,
	 * the unit of revocation and the refresh ceiling). A native array, not a
	 * delimited string: scope order is insignificant per RFC 6749 §3.3, so the
	 * value is normalized (trimmed, deduped, sorted) on write.
	 *
	 * Renamed from the legacy comma-joined `scope` string. Breaking, with no
	 * automatic data migration (and no read-time shim): the migration generator
	 * only adds the new `grantedScopes` column, so legacy accounts read as empty
	 * here until an upgrade backfills `grantedScopes` from the old `scope` values
	 * (split on comma/space, trim, drop empties, dedupe). See the release
	 * changeset for the backfill.
	 *
	 * @see https://www.rfc-editor.org/rfc/rfc6749#section-3.3
	 */
	grantedScopes: z.array(z.string()).nullish(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().nullish(),
});

export type BaseAccount = z.infer<typeof accountSchema>;

/**
 * Account schema type used by better-auth, note that it's possible that account could have additional fields
 */
export type Account<
	DBOptions extends BetterAuthOptions["account"] = BetterAuthOptions["account"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	BaseAccount &
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"account", Plugins>
>;
