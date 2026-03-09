import { z } from "zod/mini";

export const blockFeedback = z.object({
	url: z.string(),
	blockId: z.string(),
	message: z.string(),

	/** the referenced text of block */
	blockBody: z.optional(z.string()),
});

export const pageFeedback = z.object({
	opinion: z.enum(["good", "bad"]),
	url: z.string(),
	message: z.string(),
});

export const actionResponse = z.object({
	githubUrl: z.optional(z.string()),
});

export type BlockFeedback = z.infer<typeof blockFeedback>;
export type PageFeedback = z.infer<typeof pageFeedback>;
export type ActionResponse = z.infer<typeof actionResponse>;
