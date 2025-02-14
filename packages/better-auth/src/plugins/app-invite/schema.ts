import { z } from "zod";
import { generateId } from "../../utils";

export const appInvitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

export const appInvitationSchema = z.object({
	id: z.string().default(generateId),
	email: z.string(),
	status: appInvitationStatus,
	/**
	 * The id of the user who invited the user.
	 */
	inviterId: z.string(),
	expiresAt: z.date(),
});

export type AppInvitation = z.infer<typeof appInvitationSchema>;
export type AppInvitationInput = z.input<typeof appInvitationSchema>;
