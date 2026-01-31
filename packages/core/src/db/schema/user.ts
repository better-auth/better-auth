import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type";
import { coreSchema } from "./shared";

export const userSchema = coreSchema.extend({
	email: z.string().transform((val) => val.toLowerCase()),
	emailVerified: z.boolean().default(false),
	name: z.string().nullish(),
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
