import { z } from "zod";
import type { M2MOptions } from "./types";

export const m2mSchema = (options: {
	rateLimitMax: number;
	timeWindow: number;
}) => {
	const schema = {
		m2mClient: z.object({
			id: z.string(),
			clientId: z.string(),
			clientSecret: z.string(),
			name: z.string().optional(),
			disabled: z.boolean().default(false),
			expiresAt: z.date().optional(),
			scopes: z.array(z.string()).optional(),
			metadata: z.record(z.any()).optional(),
			startingCharacters: z.string().optional(),
			createdAt: z.date(),
			updatedAt: z.date(),
		}),
		rateLimit: z.object({
			key: z.string(),
			count: z.number(),
			lastRequest: z.number(),
		}),
	};

	return schema;
}; 