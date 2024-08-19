import { z } from "zod";

export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
});

export const memberSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	email: z.string(),
	role: z.string(),
});

export const invitationSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	email: z.string(),
	role: z.string(),
	status: z.enum(["pending", "accepted", "rejected"]).default("pending"),
	expiresAt: z.date(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
