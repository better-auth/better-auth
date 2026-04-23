import * as z from "zod";
import type { BetterAuthOptions, Prettify } from "../../types/index.js";
import type {
	InferDBFieldsFromOptions,
	InferDBFieldsFromPlugins,
} from "../type.js";
import { coreSchema } from "./shared.js";

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
		InferDBFieldsFromOptions<DBOptions> &
		InferDBFieldsFromPlugins<"verification", Plugins>
>;
