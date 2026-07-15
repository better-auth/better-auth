import * as z from "zod";
import type { Prettify } from "../../types";
import type { BetterAuthOptions } from "../../types/init-options";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import type { Identity } from "./identity";
import { coreSchema } from "./shared";

export const accountSchema = coreSchema.extend({
	identityId: z.coerce.string(),
	/** Public alias of the provider configuration used by this account. */
	providerId: z.string(),
	/** Stable opaque namespace of the exact provider instance. */
	providerInstanceId: z.string(),
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
	 * The set of OAuth scopes the user has granted to this account, stored
	 * as a comma-separated list. Represents the accumulated grant rather
	 * than the latest token's `scope` claim, since per RFC 6749 Section 1.5 a
	 * token's scope may be narrower than the user's grant.
	 */
	scope: z.string().nullish(),
	/**
	 * Password is only stored in the credential provider
	 */
	password: z.string().nullish(),
});

export type BaseAccount = z.infer<typeof accountSchema>;

/** The stable key for one provider instance attached to an identity. */
export type AccountKey = Readonly<
	Pick<BaseAccount, "identityId" | "providerInstanceId">
>;

/** A provider account together with the identity that owns it. */
export type AccountWithIdentity<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = Readonly<{
	account: Account<Options["account"], Options["plugins"]>;
	identity: Identity<Options["identity"], Options["plugins"]>;
}>;

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
