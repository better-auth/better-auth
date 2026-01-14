import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod/v4";

export const teamSchema = z.object({
	id: z.string().default(generateId),
	name: z.string().min(1),
	organizationId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date().optional(),
});

export const teamMemberSchema = z.object({
	id: z.string().default(generateId),
	teamId: z.string(),
	userId: z.string(),
	createdAt: z.date().default(() => new Date()),
});

export type TeamMember = z.infer<typeof teamMemberSchema>;
export type Team = z.infer<typeof teamSchema>;

export type TeamMemberInput = z.input<typeof teamMemberSchema>;
export type TeamInput = z.infer<typeof teamSchema>;
