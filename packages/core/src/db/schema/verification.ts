import * as z from "zod";
import { coreSchema } from "./shared";

export const verificationSchema = coreSchema.extend({
	value: z.string(),
	expiresAt: z.date(),
	identifier: z.string(),
});

/**
 * Verification schema type used by better-auth, note that it's possible that verification could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type Verification = z.infer<typeof verificationSchema>;
