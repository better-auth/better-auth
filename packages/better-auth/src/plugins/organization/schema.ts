import { z } from "zod";

export const role = z.enum(["admin", "member", "owner"]);
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");
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
	role,
});

export const invitationSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	expiresAt: z.date(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
