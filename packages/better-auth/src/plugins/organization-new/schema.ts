import { generateId } from "@better-auth/core/utils/id";
import * as z from "zod/v4";

const roleSchema = z.string();
const invitationStatus = z
	.enum(["pending", "accepted", "rejected", "canceled"])
	.default("pending");

const organizationSchema = z.object({
	id: z.string().default(generateId),
	name: z.string(),
	logo: z.string().nullish().optional(),
	metadata: z
		.record(z.string(), z.unknown())
		.or(
			z.string().transform((v, ctx) => {
				try {
					return JSON.parse(v);
				} catch {
					ctx.addIssue({
						code: "custom",
						message: "Invalid JSON string for metadata",
					});
					return z.NEVER;
				}
			}),
		)
		.optional(),
	createdAt: z.date(),
});

const memberSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	userId: z.coerce.string(),
	role: roleSchema,
	createdAt: z.date().default(() => new Date()),
});

const invitationSchema = z.object({
	id: z.string().default(generateId),
	organizationId: z.string(),
	email: z.string(),
	role: roleSchema,
	status: invitationStatus,
	teamId: z.string().nullish(),
	inviterId: z.string(),
	expiresAt: z.date(),
	createdAt: z.date().default(() => new Date()),
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationInput = z.input<typeof organizationSchema>;
export type Member = z.infer<typeof memberSchema>;
export type MemberInput = z.input<typeof memberSchema>;
export type Invitation = z.infer<typeof invitationSchema>;
export type InvitationInput = z.input<typeof invitationSchema>;
