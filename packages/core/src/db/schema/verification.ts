import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types";
import type { InferFieldsFromOptions, InferFieldsFromPlugins } from "../type";
import { coreSchema } from "./shared";

export const verificationSchema = coreSchema.extend({
	value: z.string(),
	expiresAt: z.date(),
	identifier: z.string(),
});

export type BaseVerification = z.infer<typeof verificationSchema>;

/**
 * Verification schema type used by better-auth, note that it's possible that verification could have additional fields
 */
export type Verification<
	DBOptions extends
		BetterAuthOptions["verification"] = BetterAuthOptions["verification"],
	Plugins extends BetterAuthOptions["plugins"] = BetterAuthOptions["plugins"],
> = Prettify<
	BaseVerification &
		InferFieldsFromOptions<DBOptions> &
		InferFieldsFromPlugins<"verification", Plugins>
>;
