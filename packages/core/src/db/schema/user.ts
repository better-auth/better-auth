import { z } from "zod";
import { coreSchema } from "./shared";

export const userSchema = coreSchema
	.extend({
		email: z.string(),
		emailVerified: z.boolean().default(false),
		name: z.string(),
		image: z.string().nullish(),
	})
	.transform((data) => ({
		...data,
		email: data.email.toLowerCase(),
	}));

/**
 * User schema type used by better-auth, note that it's possible that user could have additional fields
 *
 * todo: we should use generics to extend this type with additional fields from plugins and options in the future
 */
export type User = z.infer<typeof userSchema>;
