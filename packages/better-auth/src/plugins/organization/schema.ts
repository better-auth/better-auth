import { z } from "zod";

export const role = z.enum(["admin", "member", "owner"]);
export const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");
export const organizationSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	logo: z.string().optional(),
	metadata: z
		.record(z.string())
		.or(z.string().transform((v) => JSON.parse(v)))
		.optional(),
	createdAt: z.date(),
});

export const memberSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string(),
	role,
	createdAt: z.date(),
});

export const invitationSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	email: z.string(),
	role,
	status: invitationStatus,
	/**
	 * The id of the user who invited the user.
	 */
	inviterId: z.string(),
	expiresAt: z.date(),
});

export type Organization = z.infer<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
