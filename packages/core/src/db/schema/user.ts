import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import { coreSchema } from "./shared";

export const userSchema = coreSchema.extend({
	// TODO(#9124): widen to nullish in v2. OAuth providers (Discord phone-only,
	// Apple subsequent sign-ins, etc.) can legitimately omit email; identity
	// must key on (providerId, accountId) per OpenID Connect Core §5.7.
	email: z.string().transform((val) => val.toLowerCase()),
	emailVerified: z.boolean().default(false),
	name: z.string(),
	image: z.string().nullish(),
});

export type BaseUser = z.infer<typeof userSchema>;

/**
 * User schema type used by better-auth, note that it's possible that user could have additional fields
 */
export type User<
	DBOptions extends BetterAuthOptions["user"] = BetterAuthOptions["user"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	BaseUser &
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"user", Plugins>
>;
