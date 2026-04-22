import * as z from "zod";
import type { Prettify } from "../../types/index.js";
import type { BetterAuthOptions } from "../../types/init-options.js";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type.js";
import { coreSchema } from "./shared.js";

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
	 * The scopes that the user has authorized
	 */
	scope: z.string().nullish(),
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
