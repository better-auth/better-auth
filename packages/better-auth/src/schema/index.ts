import { z } from "zod";

export const userSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string(),
	image: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export type User = z.infer<typeof userSchema>;
