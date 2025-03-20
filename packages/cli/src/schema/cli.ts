import { z } from "zod";

export const BetterAuthConfigSchema = z.object({
	config: z.optional(
		z.object({
			path: z.string(),
		}),
	),
	tsConfig: z.optional(
		z.object({
			path: z.string(),
		}),
	),
});

export type BetterAuthConfig = z.infer<typeof BetterAuthConfigSchema>;
